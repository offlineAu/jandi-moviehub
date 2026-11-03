import { Injectable } from '@nestjs/common';
import type { RoomMemberPresence } from '@jandi/shared';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '../redis/redis.module';
import { avatarUrl } from '../users/user-view';
import { RealtimeEmitter } from './emitter';

const MEMBER_STATE = (roomId: string) => `room:${roomId}:mstate`;
const ONLINE = 'presence:online';
const WATCHING = (userId: string) => `presence:watching:${userId}`;
const DRIFT_SAMPLES = 'sync:drift:samples';
const MAX_SAMPLES = 5000;

interface MemberLiveState {
  buffering: boolean;
  driftMs: number | null;
  at: number;
}

/**
 * Presence: online users (sorted set with last-seen scores), what room each user is in,
 * and per-room member live state (buffering + measured drift) for the room UI.
 */
@Injectable()
export class PresenceService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async touchOnline(userIds: string[]) {
    if (!userIds.length) return;
    const now = Date.now();
    await this.redis.zadd(ONLINE, ...userIds.flatMap((id) => [now, id]));
  }

  async markOffline(userId: string) {
    await this.redis.zrem(ONLINE, userId);
    await this.redis.del(WATCHING(userId));
  }

  async onlineAmong(userIds: string[]): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const scores = await this.redis.zmscore(ONLINE, ...userIds);
    const cutoff = Date.now() - 75_000;
    return new Set(userIds.filter((_, i) => scores[i] != null && Number(scores[i]) > cutoff));
  }

  async setWatching(userId: string, roomId: string | null) {
    if (roomId) await this.redis.set(WATCHING(userId), roomId, 'EX', 120);
    else await this.redis.del(WATCHING(userId));
  }

  async watching(userIds: string[]): Promise<Map<string, string>> {
    if (!userIds.length) return new Map();
    const values = await this.redis.mget(...userIds.map(WATCHING));
    return new Map(userIds.flatMap((id, i) => (values[i] ? [[id, values[i]!] as const] : [])));
  }

  async setMemberState(roomId: string, userId: string, patch: Partial<MemberLiveState>) {
    const key = MEMBER_STATE(roomId);
    const prev = await this.redis.hget(key, userId);
    const state: MemberLiveState = {
      buffering: false,
      driftMs: null,
      at: Date.now(),
      ...(prev ? JSON.parse(prev) : {}),
      ...patch,
    };
    state.at = Date.now();
    await this.redis
      .multi()
      .hset(key, userId, JSON.stringify(state))
      .expire(key, 6 * 3600)
      .exec();
    return { changed: !prev || JSON.parse(prev).buffering !== state.buffering, state };
  }

  async clearMemberState(roomId: string, userId: string) {
    await this.redis.hdel(MEMBER_STATE(roomId), userId);
  }

  /** Records an absolute drift sample (ms) for global synchronization statistics. */
  async recordDrift(driftMs: number) {
    await this.redis
      .multi()
      .lpush(DRIFT_SAMPLES, Math.round(Math.abs(driftMs)))
      .ltrim(DRIFT_SAMPLES, 0, MAX_SAMPLES - 1)
      .exec();
  }

  async driftStats() {
    const raw = await this.redis.lrange(DRIFT_SAMPLES, 0, -1);
    const values = raw
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const pct = (p: number) =>
      values.length
        ? values[Math.min(values.length - 1, Math.floor((p / 100) * values.length))]!
        : null;
    return {
      samples: values.length,
      p50Ms: pct(50),
      p90Ms: pct(90),
      p95Ms: pct(95),
      p99Ms: pct(99),
      maxMs: values.length ? values[values.length - 1]! : null,
      within100ms: values.length ? values.filter((v) => v <= 100).length / values.length : null,
      within250ms: values.length ? values.filter((v) => v <= 250).length / values.length : null,
    };
  }

  /** Full member list with online/buffering/drift for MEMBER_PRESENCE broadcasts. */
  async roomPresence(roomId: string): Promise<RoomMemberPresence[]> {
    const [members, sockets, live] = await Promise.all([
      this.prisma.roomMember.findMany({
        where: { roomId, leftAt: null },
        include: { user: { include: { profile: true } } },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      }),
      this.emitter.roomSockets(roomId),
      this.redis.hgetall(MEMBER_STATE(roomId)),
    ]);
    const online = new Set(sockets.map((s) => (s.data as { user?: { id: string } }).user?.id));
    return members.map((m) => {
      const state = live[m.userId] ? (JSON.parse(live[m.userId]!) as MemberLiveState) : null;
      const isOnline = online.has(m.userId);
      return {
        userId: m.userId,
        displayName: m.user.profile?.displayName ?? m.user.username,
        avatarUrl: avatarUrl(m.user.profile?.avatarKey),
        role: m.role,
        isGuest: m.user.isGuest,
        online: isOnline,
        buffering: isOnline && !!state?.buffering,
        driftMs: isOnline ? (state?.driftMs ?? null) : null,
      };
    });
  }
}
