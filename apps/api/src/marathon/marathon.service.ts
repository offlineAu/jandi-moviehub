import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  type MarathonConfigInput,
  type MarathonSnapshot,
  type PlaybackState,
  SocketEvents,
} from '@jandi/shared';
import type { Prisma, RoomPlaylist } from '@prisma/client';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { PlaylistsService } from '../playlists/playlists.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimerQueue } from '../queue/timer-queue.service';
import { RealtimeEmitter } from '../realtime/emitter';
import { playableAssetWhere } from '../catalog/playability';
import { PlaybackService } from '../realtime/playback.service';
import { RoomPermissions } from '../rooms/room-access';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { isActiveState, type MarathonEvent, transition } from './marathon.machine';

const MAX_VOTE_CANDIDATES = 5;

@Injectable()
export class MarathonService implements OnModuleInit {
  private readonly logger = new Logger(MarathonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly playback: PlaybackService,
    private readonly playlists: PlaylistsService,
    private readonly rooms: RoomsService,
    private readonly roomEvents: RoomEvents,
    private readonly timers: TimerQueue,
    private readonly emitter: RealtimeEmitter,
  ) {}

  onModuleInit() {
    this.playback.onEnded((roomId, state) => this.onMovieEnded(roomId, state));
    this.timers.register('marathon-phase', async (data) => {
      const row = await this.prisma.roomPlaylist.findUnique({
        where: { roomId: String(data.roomId) },
      });
      if (!row || row.version !== Number(data.version)) return;
      if (row.state === 'COUNTDOWN')
        await this.dispatch(row.roomId, { type: 'COUNTDOWN_ELAPSED' }, row.version);
      else if (row.state === 'INTERMISSION') {
        await this.applyVotes(row);
        const fresh = await this.prisma.roomPlaylist.findUniqueOrThrow({ where: { id: row.id } });
        await this.dispatch(row.roomId, { type: 'INTERMISSION_ELAPSED' }, fresh.version);
      }
    });
    this.timers.register('marathon-scheduled', async (data) => {
      const row = await this.prisma.roomPlaylist.findUnique({
        where: { roomId: String(data.roomId) },
      });
      if (row && row.version === Number(data.version) && row.state === 'READY') {
        await this.dispatch(row.roomId, { type: 'START' }, row.version);
      }
    });
  }

  // ───────── Queries used by the gateway ─────────

  async isActive(roomId: string) {
    const row = await this.prisma.roomPlaylist.findUnique({
      where: { roomId },
      select: { state: true },
    });
    return !!row && isActiveState(row.state);
  }

  /** Manual "play" is blocked while the marathon is between movies (countdown/intermission). */
  async blocksManualTransport(roomId: string, action: string) {
    if (action !== 'play') return false;
    const row = await this.prisma.roomPlaylist.findUnique({
      where: { roomId },
      select: { state: true },
    });
    return !!row && ['COUNTDOWN', 'INTERMISSION', 'TRANSITIONING'].includes(row.state);
  }

  // ───────── Snapshot ─────────

  async snapshot(roomId: string, viewerId?: string): Promise<MarathonSnapshot | null> {
    const row = await this.prisma.roomPlaylist.findUnique({ where: { roomId } });
    if (!row) return null;
    const order = row.order as string[];
    const items = await this.prisma.playlistItem.findMany({
      where: { id: { in: order } },
      include: {
        movie: {
          include: {
            mediaAssets: { where: playableAssetWhere(), select: { durationSec: true }, take: 1 },
          },
        },
      },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const list = order
      .map((id) => byId.get(id))
      .filter((i): i is NonNullable<typeof i> => !!i)
      .map((i) => ({
        id: i.id,
        movieId: i.movieId,
        title: i.movie.title,
        durationSec:
          i.movie.mediaAssets[0]?.durationSec ??
          (i.movie.runtimeMin ? i.movie.runtimeMin * 60 : null),
        playable: i.movie.mediaAssets.length > 0,
      }));
    const votes = await this.prisma.playlistVote.groupBy({
      by: ['playlistItemId'],
      where: { roomPlaylistId: row.id, round: row.currentIndex },
      _count: { _all: true },
    });
    const myVote = viewerId
      ? await this.prisma.playlistVote.findUnique({
          where: {
            roomPlaylistId_round_userId: {
              roomPlaylistId: row.id,
              round: row.currentIndex,
              userId: viewerId,
            },
          },
        })
      : null;
    const playableItems = list.filter((i) => i.playable);
    const totalRuntimeSec =
      playableItems.reduce((s, i) => s + (i.durationSec ?? 0), 0) +
      Math.max(0, playableItems.length - 1) * row.intermissionSec;
    return {
      roomId,
      playlistId: row.playlistId,
      state: row.state,
      version: row.version,
      currentIndex: row.currentIndex,
      items: list,
      phaseEndsAt: row.phaseEndsAt?.getTime() ?? null,
      countdownSec: row.countdownSec,
      intermissionSec: row.intermissionSec,
      votingEnabled: row.votingEnabled,
      votes: Object.fromEntries(votes.map((v) => [v.playlistItemId, v._count._all])),
      myVote: myVote?.playlistItemId ?? null,
      totalRuntimeSec,
      estimatedFinishAt: await this.estimateFinish(row, list),
      error: row.error,
    };
  }

  /** ETA from the authoritative playback position plus remaining items and breaks. */
  private async estimateFinish(
    row: RoomPlaylist,
    list: Array<{ durationSec: number | null; playable: boolean }>,
  ) {
    if (!isActiveState(row.state) && row.state !== 'READY') return null;
    const now = Date.now();
    const rest = list.slice(row.currentIndex + 1).filter((i) => i.playable);
    const restSec =
      rest.reduce((s, i) => s + (i.durationSec ?? 0), 0) + rest.length * row.intermissionSec;
    let currentRemaining = list[row.currentIndex]?.durationSec ?? 0;
    if (row.state === 'PLAYING') {
      const pb = await this.playback.getState(row.roomId);
      const elapsed =
        pb.status === 'playing'
          ? pb.positionSec + ((now - pb.anchorServerTime) / 1000) * pb.rate
          : pb.positionSec;
      currentRemaining = Math.max(0, (pb.durationSec ?? currentRemaining) - elapsed);
    } else if (row.state === 'INTERMISSION') {
      currentRemaining = 0;
    }
    const phaseRemaining = row.phaseEndsAt
      ? Math.max(0, row.phaseEndsAt.getTime() - now) / 1000
      : 0;
    const start = row.state === 'READY' && row.scheduledFor ? row.scheduledFor.getTime() : now;
    const leading = row.state === 'READY' ? row.countdownSec : phaseRemaining;
    return Math.round(start + (leading + currentRemaining + restSec) * 1000);
  }

  private async broadcast(roomId: string) {
    const snapshot = await this.snapshot(roomId);
    this.emitter.toRoom(roomId, SocketEvents.MARATHON_STATE, snapshot);
    return snapshot;
  }

  // ───────── Commands (REST) ─────────

  private async requireController(user: AuthUser, roomId: string) {
    const m = await this.rooms.requireMember(roomId, user.id);
    if (!RoomPermissions.canModerate(m.member.role))
      throw Errors.forbidden('Only hosts can run marathons');
    return m;
  }

  async configure(user: AuthUser, roomId: string, input: MarathonConfigInput) {
    await this.requireController(user, roomId);
    const playlist = await this.playlists.getReadable(input.playlistId, user.id);
    if (!playlist.items.length)
      throw Errors.badRequest('EMPTY_PLAYLIST', 'Add movies to the playlist first');
    const existing = await this.prisma.roomPlaylist.findUnique({ where: { roomId } });
    if (existing && isActiveState(existing.state))
      throw Errors.conflict('MARATHON_ACTIVE', 'Stop the current marathon first');
    const data = {
      playlistId: playlist.id,
      state: 'READY' as const,
      currentIndex: 0,
      order: playlist.items.map((i) => i.id),
      countdownSec: input.countdownSec,
      intermissionSec: input.intermissionSec,
      votingEnabled: input.votingEnabled,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      phaseEndsAt: null,
      startedAt: null,
      completedAt: null,
      error: null,
    };
    const row = existing
      ? await this.prisma.roomPlaylist.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.prisma.roomPlaylist.create({ data: { roomId, ...data } });
    if (row.scheduledFor && row.scheduledFor.getTime() > Date.now()) {
      await this.timers.schedule(
        'marathon-scheduled',
        roomId,
        { roomId, version: row.version },
        row.scheduledFor.getTime() - Date.now(),
      );
    }
    await this.roomEvents.systemMessage(
      roomId,
      `Marathon ready: “${playlist.name}” (${playlist.items.length} movies)`,
    );
    return this.broadcast(roomId);
  }

  async command(
    user: AuthUser,
    roomId: string,
    type: 'START' | 'SKIP' | 'PREVIOUS' | 'STOP' | 'RETRY',
  ) {
    await this.requireController(user, roomId);
    const row = await this.prisma.roomPlaylist.findUnique({ where: { roomId } });
    if (!row) throw Errors.notFound('Marathon');
    const result = await this.dispatch(roomId, { type }, row.version);
    if (!result)
      throw Errors.conflict(
        'INVALID_TRANSITION',
        `Cannot ${type.toLowerCase()} while ${row.state.toLowerCase()}`,
      );
    return this.snapshot(roomId, user.id);
  }

  async remove(user: AuthUser, roomId: string) {
    await this.requireController(user, roomId);
    await this.stopForRoom(roomId);
    await this.prisma.roomPlaylist.deleteMany({ where: { roomId } });
    this.emitter.toRoom(roomId, SocketEvents.MARATHON_STATE, null);
  }

  async stopForRoom(roomId: string) {
    const row = await this.prisma.roomPlaylist.findUnique({ where: { roomId } });
    if (row && row.state !== 'IDLE') await this.dispatch(roomId, { type: 'STOP' }, row.version);
  }

  async vote(user: AuthUser, roomId: string, playlistItemId: string) {
    await this.rooms.requireMember(roomId, user.id);
    const row = await this.prisma.roomPlaylist.findUnique({ where: { roomId } });
    if (!row || !row.votingEnabled)
      throw Errors.badRequest('VOTING_DISABLED', 'Voting is not enabled');
    if (row.state !== 'INTERMISSION')
      throw Errors.conflict('VOTING_CLOSED', 'Voting opens during intermission');
    const candidates = (row.order as string[]).slice(
      row.currentIndex + 1,
      row.currentIndex + 1 + MAX_VOTE_CANDIDATES,
    );
    if (!candidates.includes(playlistItemId))
      throw Errors.badRequest('INVALID_CANDIDATE', 'That movie is not up for a vote');
    await this.prisma.playlistVote.upsert({
      where: {
        roomPlaylistId_round_userId: {
          roomPlaylistId: row.id,
          round: row.currentIndex,
          userId: user.id,
        },
      },
      create: { roomPlaylistId: row.id, round: row.currentIndex, userId: user.id, playlistItemId },
      update: { playlistItemId },
    });
    await this.broadcast(roomId);
    return this.snapshot(roomId, user.id);
  }

  /** Moves the winning candidate to play next (ties → earliest in the current order). */
  private async applyVotes(row: RoomPlaylist) {
    if (!row.votingEnabled) return;
    const order = [...(row.order as string[])];
    const candidates = order.slice(
      row.currentIndex + 1,
      row.currentIndex + 1 + MAX_VOTE_CANDIDATES,
    );
    const tallies = await this.prisma.playlistVote.groupBy({
      by: ['playlistItemId'],
      where: { roomPlaylistId: row.id, round: row.currentIndex },
      _count: { _all: true },
    });
    if (!tallies.length) return;
    const count = new Map(tallies.map((t) => [t.playlistItemId, t._count._all]));
    const winner = candidates.reduce(
      (best, id) => ((count.get(id) ?? 0) > (count.get(best) ?? 0) ? id : best),
      candidates[0]!,
    );
    if (winner === order[row.currentIndex + 1]) return;
    order.splice(order.indexOf(winner), 1);
    order.splice(row.currentIndex + 1, 0, winner);
    await this.prisma.roomPlaylist.updateMany({
      where: { id: row.id, version: row.version },
      data: { order, version: { increment: 1 } },
    });
  }

  // ───────── Engine ─────────

  private async onMovieEnded(roomId: string, state: PlaybackState) {
    const row = await this.prisma.roomPlaylist.findUnique({ where: { roomId } });
    if (!row || row.state !== 'PLAYING') return;
    const currentItemId = (row.order as string[])[row.currentIndex];
    const item = currentItemId
      ? await this.prisma.playlistItem.findUnique({ where: { id: currentItemId } })
      : null;
    if (!item || item.movieId !== state.movieId) return;
    await this.dispatch(roomId, { type: 'MOVIE_ENDED' }, row.version);
  }

  /**
   * Applies an event with optimistic concurrency: the update only succeeds if the row still has
   * `expectedVersion`. Concurrent or duplicate triggers therefore cannot double-advance.
   */
  async dispatch(
    roomId: string,
    event: MarathonEvent,
    expectedVersion: number,
  ): Promise<RoomPlaylist | null> {
    const row = await this.prisma.roomPlaylist.findUnique({ where: { roomId } });
    if (!row || row.version !== expectedVersion) return null;
    const order = row.order as string[];
    const next = transition(
      {
        state: row.state,
        currentIndex: row.currentIndex,
        itemCount: order.length,
        countdownSec: row.countdownSec,
        intermissionSec: row.intermissionSec,
      },
      event,
    );
    if (!next) return null;
    const data: Prisma.RoomPlaylistUpdateManyMutationInput = {
      state: next.state,
      currentIndex: next.currentIndex,
      version: { increment: 1 },
      phaseEndsAt: next.phaseSec != null ? new Date(Date.now() + next.phaseSec * 1000) : null,
      error: next.error === undefined ? undefined : next.error,
      ...(event.type === 'START' ? { startedAt: new Date(), completedAt: null } : {}),
      ...(next.state === 'COMPLETED' ? { completedAt: new Date() } : {}),
    };
    const { count } = await this.prisma.roomPlaylist.updateMany({
      where: { id: row.id, version: expectedVersion },
      data,
    });
    if (!count) return null;
    const updated = await this.prisma.roomPlaylist.findUniqueOrThrow({ where: { id: row.id } });

    if (next.phaseSec != null) {
      await this.timers.schedule(
        'marathon-phase',
        roomId,
        { roomId, version: updated.version },
        next.phaseSec * 1000,
      );
    }
    if (next.effect === 'PAUSE_PLAYBACK') {
      const pb = await this.playback.getState(roomId);
      if (pb.status === 'playing') await this.playback.applySystem(roomId, { type: 'pause' });
    }
    await this.announce(roomId, row.state, updated);
    await this.broadcast(roomId);
    if (next.effect === 'LOAD_CURRENT') return (await this.loadCurrent(roomId, updated)) ?? updated;
    return updated;
  }

  /** TRANSITIONING: load the current item; unplayable items are skipped. */
  private async loadCurrent(roomId: string, row: RoomPlaylist): Promise<RoomPlaylist | null> {
    const order = row.order as string[];
    for (let index = row.currentIndex; index < order.length; index++) {
      const item = await this.prisma.playlistItem.findUnique({
        where: { id: order[index]! },
        include: { movie: true },
      });
      if (!item) continue;
      const loaded = await this.playback.loadMovie(roomId, item.movieId, { autoplay: true });
      if (!loaded.ok) {
        await this.roomEvents.systemMessage(
          roomId,
          `Skipping “${item.movie.title}” — not available to stream`,
        );
        continue;
      }
      if (index !== row.currentIndex) {
        await this.prisma.roomPlaylist.updateMany({
          where: { id: row.id, version: row.version },
          data: { currentIndex: index },
        });
      }
      const fresh = await this.prisma.roomPlaylist.findUniqueOrThrow({ where: { id: row.id } });
      this.emitter.toRoom(roomId, SocketEvents.MOVIE_CHANGE, {
        roomId,
        movieId: item.movieId,
        state: loaded.data,
      });
      return this.dispatch(roomId, { type: 'MOVIE_LOADED' }, fresh.version);
    }
    const fresh = await this.prisma.roomPlaylist.findUniqueOrThrow({ where: { id: row.id } });
    return this.dispatch(
      roomId,
      { type: 'FAIL', error: 'No remaining movies are available to stream' },
      fresh.version,
    );
  }

  private async announce(roomId: string, previous: string, row: RoomPlaylist) {
    const messages: Partial<Record<string, string>> = {
      COUNTDOWN: `Marathon starting in ${row.countdownSec} seconds 🍿`,
      INTERMISSION: `Intermission — next movie in ${row.intermissionSec} seconds`,
      COMPLETED: 'Marathon complete. Thanks for watching!',
      IDLE: 'Marathon stopped',
    };
    const body = previous !== row.state ? messages[row.state] : undefined;
    if (body) await this.roomEvents.systemMessage(roomId, body);
  }
}
