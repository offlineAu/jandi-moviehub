import { KisskhStreamService } from '../catalog/kisskh-stream.service';
import { ExternalMediaResolver } from '../catalog/room-sources.controller';
import { VidsrcService } from '../catalog/vidsrc.service';
import { ExternalSeriesService } from '../catalog/external-series.controller';
import { Prisma } from '@prisma/client';
import {
  parseExternalTitle,
  externalMediaSchema,
  parseRoomTvTitle,
  roomTvEpisodeSchema,
} from '@jandi/shared';
import { MovieboxService } from '../catalog/moviebox.controller';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  type CommandAck,
  type CommandErrorCode,
  expectedPosition,
  type PlaybackState,
  SocketEvents,
} from '@jandi/shared';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { TimerQueue } from '../queue/timer-queue.service';
import { InjectRedis } from '../redis/redis.module';
import { RealtimeEmitter } from './emitter';
import { initialPlayback, type PlaybackAction, reducePlayback } from './playback.reducer';
import { MediaResolver } from './media-resolver';

const STATE_KEY = (roomId: string) => `pb:${roomId}`;
const CMD_KEY = (roomId: string, commandId: string) => `pbcmd:${roomId}:${commandId}`;
const COMMAND_TTL_SEC = 600;
/** How close to the end a client-reported MOVIE_END must be to be accepted (≤ 2 s, ≤ 5 % of short media). */
const endToleranceSec = (durationSec: number) => Math.min(2, Math.max(0.25, durationSec * 0.05));

/**
 * Atomic compare-and-set: applies the new state only if the stored version still equals the
 * expected base version and the command id has not been seen. Returns [status, currentJson].
 */
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if ARGV[3] ~= '' and redis.call('EXISTS', KEYS[2]) == 1 then
  return {'DUP', current or ''}
end
local version = -1
if current then version = cjson.decode(current)['version'] end
if tonumber(ARGV[1]) ~= version then
  return {'STALE', current or ''}
end
redis.call('SET', KEYS[1], ARGV[2])
if ARGV[3] ~= '' then redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3])) end
return {'OK', ARGV[2]}
`;

type CasRedis = Redis & {
  playbackCas(
    stateKey: string,
    cmdKey: string,
    baseVersion: number,
    next: string,
    ttl: string,
  ): Promise<[string, string]>;
};

export type EndedListener = (roomId: string, state: PlaybackState) => Promise<void>;

export interface CommandContext {
  actorId: string;
  commandId: string;
  baseVersion: number;
}

@Injectable()
export class PlaybackService implements OnModuleInit {
  private readonly logger = new Logger(PlaybackService.name);
  private readonly endedListeners: EndedListener[] = [];

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly timers: TimerQueue,
    private readonly emitter: RealtimeEmitter,
    private readonly media: MediaResolver,
    private readonly moviebox: MovieboxService,
    private readonly kisskh: ExternalSeriesService,
    private readonly external: ExternalMediaResolver,
    private readonly vidsrc: VidsrcService,
    private readonly kisskhStream: KisskhStreamService,
  ) {
    (this.redis as CasRedis).defineCommand?.('playbackCas', { numberOfKeys: 2, lua: CAS_SCRIPT });
  }

  onModuleInit() {
    this.timers.register('playback-end', (data) =>
      this.handleEndTimer(String(data.roomId), Number(data.version)),
    );
  }

  onEnded(listener: EndedListener) {
    this.endedListeners.push(listener);
  }

  // ───────── State access ─────────

  /** Current authoritative state; restores from Postgres if Redis lost it (restart/failover). */
  async getState(roomId: string): Promise<PlaybackState> {
    const raw = await this.redis.get(STATE_KEY(roomId));
    if (raw) return JSON.parse(raw) as PlaybackState;
    const row = await this.prisma.roomPlaybackState.findUnique({ where: { roomId } });
    const state: PlaybackState = row
      ? {
          roomId,
          version: row.version,
          movieId: row.movieId,
          tvEpisode: roomTvEpisodeSchema.safeParse(row.tvEpisode).success
            ? roomTvEpisodeSchema.parse(row.tvEpisode)
            : null,
          externalMedia: externalMediaSchema.safeParse(row.externalMedia).success
            ? externalMediaSchema.parse(row.externalMedia)
            : null,
          mediaAssetId: row.mediaAssetId,
          status: row.status as PlaybackState['status'],
          positionSec: row.positionSec,
          rate: row.rate,
          anchorServerTime: row.anchorAt.getTime(),
          durationSec: row.durationSec,
          updatedBy: row.updatedById,
          lastCommandId: null,
        }
      : initialPlayback(roomId, Date.now());
    // NX: never clobber a state another instance wrote meanwhile.
    await this.redis.set(STATE_KEY(roomId), JSON.stringify(state), 'NX');
    const again = await this.redis.get(STATE_KEY(roomId));
    return again ? (JSON.parse(again) as PlaybackState) : state;
  }

  private async persist(state: PlaybackState) {
    const data = {
      externalMedia: state.externalMedia ? { ...state.externalMedia } : Prisma.DbNull,
      version: state.version,
      movieId: state.movieId,
      tvEpisode: state.tvEpisode ? { ...state.tvEpisode } : Prisma.DbNull,
      mediaAssetId: state.mediaAssetId,
      status: state.status,
      positionSec: state.positionSec,
      rate: state.rate,
      anchorAt: new Date(state.anchorServerTime),
      durationSec: state.durationSec,
      updatedById: state.updatedBy,
    };
    await this.prisma.roomPlaybackState.upsert({
      where: { roomId: state.roomId },
      create: { roomId: state.roomId, ...data },
      update: data,
    });
  }

  // ───────── Commands ─────────

  /**
   * Applies a user command. Authorization is checked by the caller (gateway); this enforces
   * idempotency (commandId), staleness (baseVersion) and atomicity (Lua CAS).
   */
  async applyCommand(
    roomId: string,
    action: PlaybackAction,
    ctx: CommandContext,
  ): Promise<CommandAck> {
    const current = await this.getState(roomId);
    const seen = await this.redis.exists(CMD_KEY(roomId, ctx.commandId));
    if (seen) return { ok: true, data: current, duplicate: true };
    if (ctx.baseVersion !== current.version) {
      return {
        ok: false,
        error: { code: 'STALE', message: 'Playback state changed; resynchronizing' },
        state: current,
      };
    }
    if (
      current.externalMedia?.provider === 'vidsrc' &&
      ['play', 'pause', 'seek', 'rate', 'duration'].includes(action.type)
    )
      this.vidsrc.assertEnabled();
    if (
      current.externalMedia?.provider === 'kisskh-direct' &&
      ['play', 'pause', 'seek', 'rate', 'duration'].includes(action.type)
    )
      this.kisskhStream.assertEnabled();
    if (
      current.tvEpisode?.provider === 'kisskh-direct' &&
      ['play', 'pause', 'seek', 'rate', 'duration'].includes(action.type)
    )
      this.kisskhStream.assertEnabled();
    const result = reducePlayback(current, action, Date.now(), ctx.actorId, ctx.commandId);
    if (!result.ok)
      return {
        ok: false,
        error: { code: result.code as CommandErrorCode, message: result.message },
        state: current,
      };
    return this.commit(roomId, current.version, result.state, ctx.commandId);
  }

  /** Server-originated transition (marathon, room setup). Retries on concurrent writes. */
  async applySystem(
    roomId: string,
    action: PlaybackAction,
    attempts = 5,
  ): Promise<PlaybackState | null> {
    for (let i = 0; i < attempts; i++) {
      const current = await this.getState(roomId);
      const result = reducePlayback(current, action, Date.now(), 'system');
      if (!result.ok) return null;
      const ack = await this.commit(roomId, current.version, result.state, null);
      if (ack.ok) return ack.data;
    }
    this.logger.warn(
      `System playback action ${action.type} on ${roomId} lost CAS ${attempts} times`,
    );
    return null;
  }

  private async commit(
    roomId: string,
    baseVersion: number,
    next: PlaybackState,
    commandId: string | null,
  ): Promise<CommandAck> {
    const [status, raw] = await (this.redis as CasRedis).playbackCas(
      STATE_KEY(roomId),
      CMD_KEY(roomId, commandId ?? 'none'),
      baseVersion,
      JSON.stringify(next),
      commandId ? String(COMMAND_TTL_SEC) : '',
    );
    const stored = raw ? (JSON.parse(raw) as PlaybackState) : next;
    if (status === 'DUP') return { ok: true, data: stored, duplicate: true };
    if (status === 'STALE') {
      return {
        ok: false,
        error: { code: 'STALE', message: 'Playback state changed; resynchronizing' },
        state: stored,
      };
    }
    await this.persist(next);
    this.emitter.toRoom(roomId, SocketEvents.PLAYBACK_SYNC, {
      state: next,
      serverTime: Date.now(),
    });
    await this.scheduleEnd(next);
    return { ok: true, data: next };
  }

  /** Load a movie's primary authorized asset into the room. */
  async loadMovie(
    roomId: string,
    movieId: string,
    opts: { autoplay: boolean; actorId?: string; ctx?: CommandContext },
  ) {
    const externalSelection = parseExternalTitle(movieId);
    if (externalSelection) {
      const media = await this.external.resolve(externalSelection);
      const action: PlaybackAction = { type: 'load-external', externalMedia: media };
      const state = opts.ctx
        ? await this.applyCommand(roomId, action, opts.ctx)
        : await this.applySystem(roomId, action).then((value) =>
            value
              ? { ok: true as const, data: value }
              : {
                  ok: false as const,
                  error: { code: 'CONFLICT' as const, message: 'Could not load provider source' },
                },
          );
      if (state.ok)
        await this.prisma.room.update({
          where: { id: roomId },
          data: { movieId: media.type === 'movie' ? media.movieId : null },
        });
      return state;
    }
    const tvEpisode = parseRoomTvTitle(movieId);
    if (tvEpisode) {
      const source =
        tvEpisode.provider === 'kisskh' || tvEpisode.provider === 'kisskh-direct'
          ? await this.kisskh.resolveRoomEpisode(tvEpisode).then(async () => {
              if (tvEpisode.provider === 'kisskh-direct')
                await this.kisskhStream.resolve(tvEpisode);
              return { durationSec: null };
            })
          : await this.moviebox.playback(tvEpisode);
      const action: PlaybackAction = {
        type: 'load-tv',
        tvEpisode,
        durationSec: source.durationSec,
        autoplay:
          tvEpisode.provider === 'kisskh' || tvEpisode.provider === 'kisskh-direct'
            ? false
            : opts.autoplay,
      };
      const ack = opts.ctx
        ? await this.applyCommand(roomId, action, opts.ctx)
        : await this.applySystem(roomId, action).then((state) =>
            state
              ? { ok: true as const, data: state }
              : {
                  ok: false as const,
                  error: { code: 'CONFLICT' as const, message: 'Could not load episode' },
                },
          );
      if (ack.ok) await this.prisma.room.update({ where: { id: roomId }, data: { movieId: null } });
      return ack;
    }
    const asset = await this.media.primaryAsset(movieId);
    if (!asset)
      return {
        ok: false as const,
        error: { code: 'NO_MEDIA' as const, message: 'This movie is not available to stream' },
      };
    const action: PlaybackAction = {
      type: 'load',
      movieId,
      mediaAssetId: asset.id,
      durationSec: asset.durationSec,
      autoplay: opts.autoplay,
    };
    if (opts.ctx) {
      const ack = await this.applyCommand(roomId, action, opts.ctx);
      if (ack.ok) await this.prisma.room.update({ where: { id: roomId }, data: { movieId } });
      return ack;
    }
    const state = await this.applySystem(roomId, action);
    if (!state)
      return {
        ok: false as const,
        error: { code: 'CONFLICT' as const, message: 'Could not load movie' },
      };
    await this.prisma.room.update({ where: { id: roomId }, data: { movieId } });
    return { ok: true as const, data: state };
  }

  // ───────── End-of-movie detection (server owned) ─────────

  private async scheduleEnd(state: PlaybackState) {
    if (state.status !== 'playing' || state.durationSec == null) return;
    const remainingSec =
      Math.max(0, state.durationSec - state.positionSec) / Math.max(state.rate, 0.01);
    await this.timers.schedule(
      'playback-end',
      state.roomId,
      { roomId: state.roomId, version: state.version },
      remainingSec * 1000 + 250,
    );
  }

  private async handleEndTimer(roomId: string, version: number) {
    const state = await this.getState(roomId);
    if (state.version !== version || state.status !== 'playing' || state.durationSec == null)
      return;
    if (expectedPosition(state, Date.now()) < state.durationSec - 0.5) {
      await this.scheduleEnd(state); // clock skew / early fire: re-arm
      return;
    }
    await this.markEnded(roomId, state);
  }

  /** A member reports the movie finished. Accepted only if consistent with server time. */
  async reportEnded(roomId: string, version: number): Promise<CommandAck> {
    const state = await this.getState(roomId);
    if (state.version !== version)
      return { ok: false, error: { code: 'STALE', message: 'Stale end report' }, state };
    if (state.status !== 'playing' || state.durationSec == null) {
      return { ok: false, error: { code: 'INVALID', message: 'Nothing is playing' }, state };
    }
    if (
      expectedPosition(state, Date.now()) <
      state.durationSec - endToleranceSec(state.durationSec)
    ) {
      return {
        ok: false,
        error: { code: 'INVALID', message: 'The movie has not reached its end yet' },
        state,
      };
    }
    const ended = await this.markEnded(roomId, state);
    return ended
      ? { ok: true, data: ended }
      : { ok: true, data: await this.getState(roomId), duplicate: true };
  }

  private async markEnded(roomId: string, state: PlaybackState) {
    const result = reducePlayback(state, { type: 'end' }, Date.now(), 'system');
    if (!result.ok) return null;
    const ack = await this.commit(roomId, state.version, result.state, null);
    if (!ack.ok) return null; // someone else changed state; their transition wins
    for (const l of this.endedListeners) {
      await l(roomId, ack.data).catch((e: unknown) => this.logger.error(e));
    }
    return ack.data;
  }

  // ───────── Lifecycle ─────────

  async clear(roomId: string) {
    await this.timers.cancel('playback-end', roomId);
  }
}
