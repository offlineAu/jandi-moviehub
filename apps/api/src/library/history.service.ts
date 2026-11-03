import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@jandi/shared';
import type { WatchHistory } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { paginate } from '../catalog/catalog.types';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { COMPLETION_RATIO, CONTINUE_MIN_SEC } from './library.schemas';

export function computeProgress(positionSec: number, durationSec: number | null) {
  const position = Math.max(0, durationSec ? Math.min(positionSec, durationSec) : positionSec);
  const completed = !!durationSec && durationSec > 0 && position >= durationSec * COMPLETION_RATIO;
  return { positionSec: Math.round(position * 1000) / 1000, completed };
}

/** Watch history / progress. `recordProgress` is the entry point for rooms and the player. */
@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async recordProgress(userId: string, movieId: string, positionSec: number, durationSec?: number) {
    const movie = await this.prisma.movie.findUnique({
      where: { id: movieId },
      select: { runtimeMin: true },
    });
    if (!movie) throw Errors.notFound('Movie');
    const existing = await this.prisma.watchHistory.findUnique({
      where: { userId_movieId: { userId, movieId } },
    });
    const duration =
      durationSec && durationSec > 0
        ? durationSec
        : (existing?.durationSec ?? (movie.runtimeMin ? movie.runtimeMin * 60 : null));
    const progress = computeProgress(positionSec, duration);
    const data = { ...progress, durationSec: duration, lastWatchedAt: new Date() };
    return this.prisma.watchHistory.upsert({
      where: { userId_movieId: { userId, movieId } },
      create: { userId, movieId, ...data },
      update: data,
    });
  }

  private async withMovies(rows: WatchHistory[], viewerId: string) {
    const movies = new Map(
      (
        await this.catalog.getSummaries(
          rows.map((r) => r.movieId),
          viewerId,
        )
      ).map((m) => [m.id, m]),
    );
    return rows
      .filter((r) => movies.has(r.movieId))
      .map((r) => ({
        movie: movies.get(r.movieId)!,
        positionSec: r.positionSec,
        durationSec: r.durationSec,
        completed: r.completed,
        lastWatchedAt: r.lastWatchedAt,
      }));
  }

  async list(userId: string, { page, pageSize }: PaginationQuery) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.watchHistory.count({ where: { userId } }),
      this.prisma.watchHistory.findMany({
        where: { userId },
        orderBy: [{ lastWatchedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return paginate(await this.withMovies(rows, userId), page, pageSize, total);
  }

  async continueWatching(userId: string) {
    const rows = await this.prisma.watchHistory.findMany({
      where: { userId, completed: false, positionSec: { gte: CONTINUE_MIN_SEC } },
      orderBy: { lastWatchedAt: 'desc' },
      take: 20,
    });
    return { items: await this.withMovies(rows, userId) };
  }

  async progressFor(userId: string, movieId: string) {
    const row = await this.prisma.watchHistory.findUnique({
      where: { userId_movieId: { userId, movieId } },
    });
    return row
      ? { positionSec: row.positionSec, durationSec: row.durationSec, completed: row.completed }
      : null;
  }

  async remove(userId: string, movieId: string) {
    await this.prisma.watchHistory.deleteMany({ where: { userId, movieId } });
  }

  async clear(userId: string) {
    await this.prisma.watchHistory.deleteMany({ where: { userId } });
  }
}
