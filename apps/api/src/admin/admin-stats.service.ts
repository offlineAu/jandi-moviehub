import { Injectable } from '@nestjs/common';
import { MEDIA_ASSET_STATUSES, type MediaAssetStatus } from '@jandi/shared';
import { Prisma } from '@prisma/client';
import { playableMovieWhere } from '../catalog/playability';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';

const DAY_MS = 86_400_000;
/** Rooms touched this recently count as "recently active" (proxy for rooms with live sockets). */
export const RECENTLY_ACTIVE_WINDOW_MIN = 10;

type Bucket = { day: string; count: number };
export interface DailyPoint {
  date: string;
  count: number;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Expands sparse SQL buckets into a dense, zero-filled series of exactly `days.length` points. */
export function zeroFill(days: string[], buckets: Bucket[]): DailyPoint[] {
  const byDay = new Map(buckets.map((b) => [b.day, Number(b.count)]));
  return days.map((date) => ({ date, count: byDay.get(date) ?? 0 }));
}

/** UTC calendar days ending today, oldest first. */
export function dayRange(days: number, now = new Date()): { start: Date; days: string[] } {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(todayUtc - (days - 1) * DAY_MS);
  return {
    start,
    days: Array.from({ length: days }, (_, i) => isoDay(new Date(start.getTime() + i * DAY_MS))),
  };
}

@Injectable()
export class AdminStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async overview() {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS);
    const dayAgo = new Date(now - DAY_MS);
    const activeSince = new Date(now - RECENTLY_ACTIVE_WINDOW_MIN * 60_000);
    const p = this.prisma;
    const [
      usersTotal,
      usersNew,
      guests,
      suspended,
      roomsOpen,
      roomsNew,
      roomsRecent,
      messages24h,
      moviesTotal,
      moviesPlayable,
      assetGroups,
      reportsOpen,
      sync,
    ] = await Promise.all([
      p.user.count(),
      p.user.count({ where: { createdAt: { gte: weekAgo }, isGuest: false } }),
      p.user.count({ where: { isGuest: true } }),
      p.user.count({ where: { suspendedAt: { not: null } } }),
      p.room.count({ where: { status: 'OPEN' } }),
      p.room.count({ where: { createdAt: { gte: weekAgo } } }),
      p.room.count({ where: { status: 'OPEN', lastActiveAt: { gte: activeSince } } }),
      p.message.count({ where: { kind: 'USER', createdAt: { gte: dayAgo } } }),
      p.movie.count(),
      p.movie.count({ where: playableMovieWhere() }),
      p.mediaAsset.groupBy({ by: ['status'], _count: { _all: true } }),
      p.report.count({ where: { status: 'OPEN' } }),
      this.presence.driftStats(),
    ]);
    const mediaAssets = Object.fromEntries(MEDIA_ASSET_STATUSES.map((s) => [s, 0])) as Record<
      MediaAssetStatus,
      number
    >;
    for (const g of assetGroups) mediaAssets[g.status] = g._count._all;
    return {
      users: {
        total: usersTotal,
        registered: usersTotal - guests,
        guests,
        suspended,
        newLast7d: usersNew,
      },
      rooms: {
        open: roomsOpen,
        createdLast7d: roomsNew,
        /** OPEN rooms whose lastActiveAt is within the last 10 minutes (approximation of rooms with sockets). */
        recentlyActiveRooms: roomsRecent,
        recentlyActiveWindowMin: RECENTLY_ACTIVE_WINDOW_MIN,
      },
      messages: { last24h: messages24h },
      movies: { total: moviesTotal, playable: moviesPlayable },
      mediaAssets,
      reports: { open: reportsOpen },
      sync,
      generatedAt: new Date(now).toISOString(),
    };
  }

  async analytics(daysCount: number) {
    const { start, days } = dayRange(daysCount);
    const [signups, rooms, messages, watch, top] = await Promise.all([
      this.prisma.$queryRaw<Bucket[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM users WHERE created_at >= ${start} AND is_guest = false GROUP BY 1`),
      this.prisma.$queryRaw<Bucket[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM rooms WHERE created_at >= ${start} GROUP BY 1`),
      this.prisma.$queryRaw<Bucket[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM messages WHERE created_at >= ${start} AND kind = 'USER' GROUP BY 1`),
      this.prisma.$queryRaw<Bucket[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', last_watched_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM watch_history WHERE last_watched_at >= ${start} GROUP BY 1`),
      this.prisma.$queryRaw<Array<{ movieId: string; title: string; viewers: number }>>(Prisma.sql`
        SELECT m.id AS "movieId", m.title, count(DISTINCT wh.user_id)::int AS viewers
        FROM watch_history wh JOIN movies m ON m.id = wh.movie_id
        WHERE wh.last_watched_at >= ${start}
        GROUP BY m.id, m.title
        ORDER BY viewers DESC, m.title ASC
        LIMIT 10`),
    ]);
    return {
      days: daysCount,
      from: days[0]!,
      to: days[days.length - 1]!,
      series: {
        signups: zeroFill(days, signups),
        roomsCreated: zeroFill(days, rooms),
        messages: zeroFill(days, messages),
        watchHistoryUpdates: zeroFill(days, watch),
      },
      topMovies: top.map((t) => ({
        movieId: t.movieId,
        title: t.title,
        viewers: Number(t.viewers),
      })),
    };
  }

  syncStats() {
    return this.presence.driftStats();
  }
}
