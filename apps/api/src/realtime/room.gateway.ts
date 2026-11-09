import { Errors } from '../common/errors';
import { playbackSelectionSchema, selectionTitle } from '@jandi/shared';
import { roomTitleSchema } from '@jandi/shared';
import { type BeforeApplicationShutdown, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  burstSchema,
  type CommandAck,
  type CommandError,
  type HeartbeatPayload,
  marathonVoteSchema,
  reactSchema,
  type RoomSnapshot,
  SESSION_COOKIE,
  sendMessageSchema,
  SocketEvents,
  uuidSchema,
} from '@jandi/shared';
import { parse as parseCookie } from 'cookie';
import type { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { SessionService } from '../auth/session.service';
import { SocketTicketService } from '../auth/socket-ticket.service';
import type { AuthUser } from '../common/auth-context';
import { AppError } from '../common/errors';
import { ErrorReporter } from '../common/error-reporter';
import { RateLimiterService } from '../common/rate-limiter.service';
import { ChatService } from '../chat/chat.service';
import { HistoryService } from '../library/history.service';
import { MarathonService } from '../marathon/marathon.service';
import { InjectRedis } from '../redis/redis.module';
import { RoomPermissions } from '../rooms/room-access';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeEmitter, roomChannel, userChannel } from './emitter';
import type { PlaybackAction } from './playback.reducer';
import { PlaybackService } from './playback.service';
import { PresenceService } from './presence.service';

interface SocketData {
  user: AuthUser;
  rooms: Set<string>;
}
type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

const commandBase = z.object({
  roomId: uuidSchema,
  commandId: z.string().min(8).max(64),
  baseVersion: z.number().int().min(0),
});
const commandSchemas = {
  play: commandBase.extend({ positionSec: z.number().min(0).max(86_400).optional() }),
  pause: commandBase.extend({ positionSec: z.number().min(0).max(86_400).optional() }),
  seek: commandBase.extend({ positionSec: z.number().min(0).max(86_400) }),
  metadata: commandBase.extend({ durationSec: z.number().min(1).max(86400) }),
  rate: commandBase.extend({ rate: z.number().min(0.25).max(2) }),
  movie: commandBase
    .extend({
      movieId: roomTitleSchema.optional(),
      playbackSelection: playbackSelectionSchema.optional(),
    })
    .refine((v) => Boolean(v.movieId) !== Boolean(v.playbackSelection), {
      message: 'Choose one playback selection',
    }),
};
const roomRef = z.object({ roomId: uuidSchema });
const heartbeatSchema = z.object({
  roomId: uuidSchema,
  version: z.number().int().min(0),
  positionSec: z.number().min(0).max(86_400),
  driftSec: z.number().min(-86_400).max(86_400),
  buffering: z.boolean(),
  rttMs: z.number().min(0).max(60_000).optional(),
});
const endSchema = z.object({
  roomId: uuidSchema,
  version: z.number().int().min(0),
  positionSec: z.number().min(0),
});
const deleteSchema = z.object({ messageId: uuidSchema });

const fail = (code: CommandError['code'], message: string): CommandAck<never> => ({
  ok: false,
  error: { code, message },
});

function toAckError(error: unknown): CommandAck<never> {
  if (error instanceof AppError) {
    const map: Record<string, CommandError['code']> = {
      NOT_IN_ROOM: 'NOT_IN_ROOM',
      RATE_LIMITED: 'RATE_LIMITED',
      NOT_FOUND: 'NOT_FOUND',
      VALIDATION_FAILED: 'INVALID',
      ROOM_CLOSED: 'NOT_IN_ROOM',
    };
    const status = error.getStatus();
    const code =
      map[error.code] ??
      (status === 403
        ? 'FORBIDDEN'
        : status === 409
          ? 'CONFLICT'
          : status < 500
            ? 'INVALID'
            : 'INTERNAL');
    // HttpException.message is derived from the class name ("App Error") for object responses;
    // the human text lives in the response body.
    const body = error.getResponse() as { error?: { message?: unknown } };
    return fail(code, typeof body.error?.message === 'string' ? body.error.message : error.message);
  }
  if (error instanceof z.ZodError) return fail('INVALID', 'Invalid payload');
  return fail('INTERNAL', 'Something went wrong');
}

/**
 * Real-time entry point. Every handler re-validates input and permissions on the server;
 * the client is never trusted with authority over shared room state.
 */
@WebSocketGateway()
export class RoomGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, BeforeApplicationShutdown
{
  private readonly logger = new Logger(RoomGateway.name);
  private readonly presenceTimers = new Map<string, NodeJS.Timeout>();
  private onlineInterval?: NodeJS.Timeout;
  private shuttingDown = false;
  private server!: Server;

  constructor(
    private readonly sessions: SessionService,
    private readonly emitter: RealtimeEmitter,
    private readonly rooms: RoomsService,
    private readonly roomEvents: RoomEvents,
    private readonly playback: PlaybackService,
    private readonly presence: PresenceService,
    private readonly chat: ChatService,
    private readonly marathon: MarathonService,
    private readonly limiter: RateLimiterService,
    private readonly reporter: ErrorReporter,
    private readonly history: HistoryService,
    @InjectRedis() private readonly redis: Redis,
    private readonly socketTickets: SocketTicketService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
    this.emitter.attach(server);
    server.use((socket, next) => {
      void this.authenticate(socket as AppSocket)
        .then((ok) => (ok ? next() : next(new Error('UNAUTHENTICATED'))))
        .catch(() => next(new Error('UNAUTHENTICATED')));
    });
    this.roomEvents.register({
      presenceChanged: async (roomId) => this.schedulePresence(roomId),
      roomCreated: async (roomId, _hostId, movieId) => {
        if (movieId) {
          const loaded = await this.playback.loadMovie(roomId, movieId, { autoplay: false });
          if (!loaded.ok) throw Errors.badRequest(loaded.error.code, loaded.error.message);
        } else await this.playback.getState(roomId);
      },
      roomClosed: async (roomId) => {
        await this.playback.clear(roomId);
        await this.marathon.stopForRoom(roomId);
      },
    });
    // Refresh online scores for locally connected users (other instances refresh their own).
    this.onlineInterval = setInterval(() => {
      const ids = new Set<string>();
      for (const s of server.sockets.sockets.values()) {
        const user = (s.data as SocketData).user;
        if (user) ids.add(user.id);
      }
      void this.presence.touchOnline([...ids]).catch(() => undefined);
    }, 30_000);
    this.onlineInterval.unref();
  }

  private async authenticate(socket: AppSocket) {
    const header = socket.handshake.headers.cookie;
    const token = header ? parseCookie(header)[SESSION_COOKIE] : undefined;
    const ticket: unknown = socket.handshake.auth?.ticket;
    const user =
      ticket !== undefined
        ? await this.socketTickets.redeem(ticket)
        : token
          ? await this.sessions.resolve(token)
          : null;
    if (!user) return false;
    socket.data.user = user;
    socket.data.rooms = new Set();
    return true;
  }

  async handleConnection(socket: AppSocket) {
    if (!socket.data.user) return socket.disconnect(true);
    await socket.join(userChannel(socket.data.user.id));
    await this.presence.touchOnline([socket.data.user.id]);
  }

  /**
   * Runs on every disconnect, including when the server closes sockets at shutdown, so it must
   * never reject: failures are reported, not thrown.
   */
  async handleDisconnect(socket: AppSocket) {
    const user = socket.data.user;
    if (!user || this.shuttingDown) return;
    try {
      for (const roomId of socket.data.rooms ?? [])
        await this.afterLeaveChannel(roomId, user, socket.id);
      if (!(await this.emitter.userOnline(user.id))) await this.presence.markOffline(user.id);
    } catch (error) {
      if (!this.shuttingDown) this.reporter.report(error, { scope: 'disconnect' });
    }
  }

  beforeApplicationShutdown() {
    this.shuttingDown = true;
    clearInterval(this.onlineInterval);
  }

  /** Common wrapper: validation + error → ack mapping. */
  private async run<T>(fn: () => Promise<CommandAck<T> | T>): Promise<CommandAck<T>> {
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'ok' in (result as object))
        return result as CommandAck<T>;
      return { ok: true, data: result as T };
    } catch (error) {
      if (!(error instanceof AppError) && !(error instanceof z.ZodError))
        this.reporter.report(error, { scope: 'gateway' });
      return toAckError(error);
    }
  }

  // ───────── Clock ─────────

  @SubscribeMessage(SocketEvents.CLOCK_PING)
  clockPing(@MessageBody() body: { clientSentAt?: number }) {
    return { clientSentAt: Number(body?.clientSentAt) || 0, serverTime: Date.now() };
  }

  // ───────── Room channel ─────────

  @SubscribeMessage(SocketEvents.ROOM_JOIN)
  join(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run<RoomSnapshot>(async () => {
      const { roomId } = roomRef.parse(body);
      const user = socket.data.user;
      const { room, member } = await this.rooms.requireMember(roomId, user.id);
      await socket.join(roomChannel(roomId));
      socket.data.rooms.add(roomId);
      await this.presence.setWatching(user.id, roomId);
      if (room.hostId === user.id) await this.rooms.onHostReconnected(roomId);
      this.schedulePresence(roomId);
      const [playback, members, marathon] = await Promise.all([
        this.playback.getState(roomId),
        this.presence.roomPresence(roomId),
        this.marathon.snapshot(roomId, user.id),
      ]);
      return {
        room: {
          id: room.id,
          code: room.code,
          name: room.name,
          hostId: room.hostId,
          controlPolicy: room.controlPolicy,
          status: room.status,
        },
        playback,
        members,
        marathon,
        you: {
          userId: user.id,
          role: member.role,
          canControl: RoomPermissions.canControlPlayback(room.controlPolicy, member.role),
        },
        serverTime: Date.now(),
      };
    });
  }

  @SubscribeMessage(SocketEvents.ROOM_LEAVE)
  leaveChannel(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { roomId } = roomRef.parse(body);
      await socket.leave(roomChannel(roomId));
      socket.data.rooms.delete(roomId);
      await this.afterLeaveChannel(roomId, socket.data.user, socket.id);
      return { roomId };
    });
  }

  private async afterLeaveChannel(roomId: string, user: AuthUser, socketId: string) {
    const remaining = (await this.emitter.roomSockets(roomId)).filter(
      (s) => (s.data as SocketData).user?.id === user.id && s.id !== socketId,
    );
    if (remaining.length) return;
    await this.presence.clearMemberState(roomId, user.id);
    await this.presence.setWatching(user.id, null);
    this.schedulePresence(roomId);
    const room = await this.rooms.requireMember(roomId, user.id).catch(() => null);
    if (room && room.room.hostId === user.id) await this.rooms.onHostDisconnected(roomId, user.id);
  }

  /** Debounced MEMBER_PRESENCE broadcast (coalesces join/leave storms). */
  private schedulePresence(roomId: string) {
    if (this.presenceTimers.has(roomId)) return;
    const timer = setTimeout(() => {
      this.presenceTimers.delete(roomId);
      void this.presence
        .roomPresence(roomId)
        .then((members) =>
          this.emitter.toRoom(roomId, SocketEvents.MEMBER_PRESENCE, { roomId, members }),
        )
        .catch((e: unknown) => this.reporter.report(e));
    }, 150);
    timer.unref();
    this.presenceTimers.set(roomId, timer);
  }

  // ───────── Playback commands ─────────

  private async authorizeControl(socket: AppSocket, roomId: string) {
    if (!socket.data.rooms.has(roomId))
      throw new AppError(403, 'NOT_IN_ROOM', 'Join the room channel first');
    const { room, member } = await this.rooms.requireMember(roomId, socket.data.user.id);
    if (!RoomPermissions.canControlPlayback(room.controlPolicy, member.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Only hosts can control playback in this room');
    }
    const limit = await this.limiter.hit(`pbcmd:${roomId}:${socket.data.user.id}`, 20, 5);
    if (!limit.allowed) throw new AppError(429, 'RATE_LIMITED', 'Too many playback commands');
    return room;
  }

  private command(
    socket: AppSocket,
    body: unknown,
    schema: z.ZodType,
    toAction: (p: never) => PlaybackAction,
  ) {
    return this.run(async () => {
      const parsed = schema.parse(body) as {
        roomId: string;
        commandId: string;
        baseVersion: number;
      };
      await this.authorizeControl(socket, parsed.roomId);
      if (
        await this.marathon.blocksManualTransport(parsed.roomId, toAction(parsed as never).type)
      ) {
        return fail('CONFLICT', 'The marathon controls this action');
      }
      return this.playback.applyCommand(parsed.roomId, toAction(parsed as never), {
        actorId: socket.data.user.id,
        commandId: parsed.commandId,
        baseVersion: parsed.baseVersion,
      });
    });
  }

  @SubscribeMessage(SocketEvents.PLAYBACK_PLAY)
  play(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.command(socket, body, commandSchemas.play, (p: { positionSec?: number }) => ({
      type: 'play',
      positionSec: p.positionSec,
    }));
  }

  @SubscribeMessage(SocketEvents.PLAYBACK_PAUSE)
  pause(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.command(socket, body, commandSchemas.pause, (p: { positionSec?: number }) => ({
      type: 'pause',
      positionSec: p.positionSec,
    }));
  }

  @SubscribeMessage(SocketEvents.PLAYBACK_SEEK)
  seek(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.command(socket, body, commandSchemas.seek, (p: { positionSec: number }) => ({
      type: 'seek',
      positionSec: p.positionSec,
    }));
  }

  @SubscribeMessage(SocketEvents.PLAYBACK_METADATA)
  metadata(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.command(socket, body, commandSchemas.metadata, (p: { durationSec: number }) => ({
      type: 'duration',
      durationSec: p.durationSec,
    }));
  }

  @SubscribeMessage(SocketEvents.PLAYBACK_RATE_CHANGE)
  rate(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.command(socket, body, commandSchemas.rate, (p: { rate: number }) => ({
      type: 'rate',
      rate: p.rate,
    }));
  }

  @SubscribeMessage(SocketEvents.MOVIE_CHANGE)
  movieChange(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const p = commandSchemas.movie.parse(body);
      await this.authorizeControl(socket, p.roomId);
      if (await this.marathon.isActive(p.roomId))
        return fail('CONFLICT', 'Stop the marathon before changing the movie');
      const title = p.playbackSelection ? selectionTitle(p.playbackSelection) : p.movieId!;
      const ack = await this.playback.loadMovie(p.roomId, title, {
        autoplay: false,
        ctx: { actorId: socket.data.user.id, commandId: p.commandId, baseVersion: p.baseVersion },
      });
      if (ack.ok) {
        this.emitter.toRoom(p.roomId, SocketEvents.MOVIE_CHANGE, {
          roomId: p.roomId,
          movieId: title,
          state: ack.data,
        });
      }
      return ack;
    });
  }

  @SubscribeMessage(SocketEvents.MOVIE_END)
  movieEnd(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const p = endSchema.parse(body);
      if (!socket.data.rooms.has(p.roomId))
        return fail('NOT_IN_ROOM', 'Join the room channel first');
      return this.playback.reportEnded(p.roomId, p.version);
    });
  }

  // ───────── Telemetry ─────────

  @SubscribeMessage(SocketEvents.PLAYBACK_HEARTBEAT)
  heartbeat(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const p = heartbeatSchema.parse(body) as HeartbeatPayload;
      if (!socket.data.rooms.has(p.roomId))
        return fail('NOT_IN_ROOM', 'Join the room channel first');
      const limit = await this.limiter.hit(`hb:${socket.id}`, 5, 5);
      if (!limit.allowed) return fail('RATE_LIMITED', 'Heartbeat too frequent');
      const state = await this.playback.getState(p.roomId);
      const driftMs = Math.round(p.driftSec * 1000);
      // Only samples taken against the current version while playing measure real sync error.
      if (state.version === p.version && state.status === 'playing' && !p.buffering)
        await this.presence.recordDrift(driftMs);
      const { changed } = await this.presence.setMemberState(p.roomId, socket.data.user.id, {
        buffering: p.buffering,
        driftMs,
      });
      await this.presence.setWatching(socket.data.user.id, p.roomId);
      if (changed) this.schedulePresence(p.roomId);
      if (state.movieId && !socket.data.user.isGuest)
        await this.recordHistory(
          socket.data.user.id,
          p.roomId,
          state.movieId,
          p.positionSec,
          state.durationSec,
        );
      return { version: state.version, serverTime: Date.now() };
    });
  }

  /** Room viewing counts toward watch history; written at most every 30 s per member. */
  private async recordHistory(
    userId: string,
    roomId: string,
    movieId: string,
    positionSec: number,
    durationSec: number | null,
  ) {
    const fresh = await this.redis.set(`hist:${roomId}:${userId}`, '1', 'EX', 30, 'NX');
    if (fresh)
      await this.history.recordProgress(userId, movieId, positionSec, durationSec ?? undefined);
  }

  @SubscribeMessage(SocketEvents.PLAYBACK_BUFFERING)
  buffering(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.setBuffering(socket, body, true);
  }

  @SubscribeMessage(SocketEvents.PLAYBACK_RECOVERED)
  recovered(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.setBuffering(socket, body, false);
  }

  private setBuffering(socket: AppSocket, body: unknown, buffering: boolean) {
    return this.run(async () => {
      const { roomId } = roomRef.parse(body);
      if (!socket.data.rooms.has(roomId)) return fail('NOT_IN_ROOM', 'Join the room channel first');
      const { changed } = await this.presence.setMemberState(roomId, socket.data.user.id, {
        buffering,
      });
      if (changed) this.schedulePresence(roomId);
      return { buffering };
    });
  }

  // ───────── Chat ─────────

  @SubscribeMessage(SocketEvents.CHAT_SEND)
  chatSend(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(() => this.chat.send(socket.data.user, sendMessageSchema.parse(body)));
  }

  @SubscribeMessage(SocketEvents.CHAT_DELETE)
  chatDelete(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(() => this.chat.remove(socket.data.user, deleteSchema.parse(body).messageId));
  }

  @SubscribeMessage(SocketEvents.CHAT_REACT)
  chatReact(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(() => {
      const p = reactSchema.parse(body);
      return this.chat.react(socket.data.user, p.roomId, p.messageId, p.emoji);
    });
  }

  @SubscribeMessage(SocketEvents.REACTION_BURST)
  reactionBurst(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(() => {
      const p = burstSchema.parse(body);
      return this.chat.burst(socket.data.user, p.roomId, p.emoji);
    });
  }

  // ───────── Marathon ─────────

  @SubscribeMessage(SocketEvents.MARATHON_VOTE)
  marathonVote(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.run(() => {
      const p = marathonVoteSchema.parse(body);
      return this.marathon.vote(socket.data.user, p.roomId, p.playlistItemId);
    });
  }
}
