import type { ExternalMedia, PlaybackSelection } from '../playback-selection';
import type { RoomTvEpisode } from '../room-title';
import type { ControlPolicy, MarathonStateName, RoomRole, ReactionEmoji } from '../constants';

/**
 * Socket.IO event names. Client→server commands are acknowledged with a
 * {@link CommandAck}; server→client events are broadcast to the room.
 */
export const SocketEvents = {
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_STATE: 'room:state',
  ROOM_CLOSED: 'room:closed',
  ROOM_UPDATED: 'room:updated',
  MEMBER_KICKED: 'member:kicked',
  MEMBER_PRESENCE: 'member:presence',
  HOST_TRANSFER: 'host:transfer',

  PLAYBACK_PLAY: 'playback:play',
  PLAYBACK_PAUSE: 'playback:pause',
  PLAYBACK_SEEK: 'playback:seek',
  PLAYBACK_RATE_CHANGE: 'playback:rate',
  PLAYBACK_METADATA: 'playback:metadata',
  PLAYBACK_SYNC: 'playback:sync',
  PLAYBACK_HEARTBEAT: 'playback:heartbeat',
  PLAYBACK_BUFFERING: 'playback:buffering',
  PLAYBACK_RECOVERED: 'playback:recovered',
  MOVIE_CHANGE: 'movie:change',
  MOVIE_END: 'movie:end',
  CLOCK_PING: 'clock:ping',

  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
  CHAT_DELETE: 'chat:delete',
  CHAT_DELETED: 'chat:deleted',
  CHAT_REACT: 'chat:react',
  CHAT_REACTIONS: 'chat:reactions',
  REACTION_BURST: 'reaction:burst',
  SYSTEM_MESSAGE: 'chat:system',

  MARATHON_STATE: 'marathon:state',
  MARATHON_VOTE: 'marathon:vote',

  NOTIFICATION: 'notification',
  PRESENCE_UPDATE: 'presence:update',
} as const;
export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended';

/**
 * Authoritative playback state. The expected position at server time T is
 * `positionSec + (T - anchorServerTime) / 1000 * rate` while playing.
 */
export interface PlaybackState {
  externalMedia?: ExternalMedia | null;
  tvEpisode?: RoomTvEpisode | null;
  roomId: string;
  version: number;
  movieId: string | null;
  mediaAssetId: string | null;
  status: PlaybackStatus;
  positionSec: number;
  rate: number;
  anchorServerTime: number;
  durationSec: number | null;
  updatedBy: string | null;
  lastCommandId: string | null;
}

export type CommandErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_IN_ROOM'
  | 'STALE'
  | 'INVALID'
  | 'NO_MEDIA'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export type CommandAck<T = PlaybackState> =
  | { ok: true; data: T; duplicate?: boolean }
  | { ok: false; error: CommandError; state?: PlaybackState };

/** Common envelope for every playback command. */
export interface PlaybackCommandBase {
  roomId: string;
  /** Client-generated unique id; replays are acknowledged without re-applying. */
  commandId: string;
  /** The state version the client based this command on. */
  baseVersion: number;
}
export interface PlayCommand extends PlaybackCommandBase {
  positionSec?: number;
}
export type PauseCommand = PlayCommand;
export interface SeekCommand extends PlaybackCommandBase {
  positionSec: number;
}
export interface RateCommand extends PlaybackCommandBase {
  rate: number;
}
export interface MovieChangeCommand extends PlaybackCommandBase {
  movieId?: string;
  playbackSelection?: PlaybackSelection;
}
export interface MovieEndReport {
  roomId: string;
  version: number;
  positionSec: number;
}
export interface HeartbeatPayload {
  roomId: string;
  version: number;
  positionSec: number;
  /** Measured local drift (local − expected), seconds. */
  driftSec: number;
  buffering: boolean;
  rttMs?: number;
}
export interface ClockPingAck {
  clientSentAt: number;
  serverTime: number;
}

export interface RoomMemberPresence {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: RoomRole;
  isGuest: boolean;
  online: boolean;
  buffering: boolean;
  driftMs: number | null;
}

export interface RoomSnapshot {
  room: {
    id: string;
    code: string;
    name: string;
    hostId: string;
    controlPolicy: ControlPolicy;
    status: 'OPEN' | 'CLOSED';
  };
  playback: PlaybackState;
  members: RoomMemberPresence[];
  marathon: MarathonSnapshot | null;
  you: { userId: string; role: RoomRole; canControl: boolean };
  serverTime: number;
}

export interface MarathonSnapshot {
  roomId: string;
  playlistId: string;
  state: MarathonStateName;
  version: number;
  currentIndex: number;
  items: Array<{
    id: string;
    movieId: string;
    title: string;
    durationSec: number | null;
    playable: boolean;
  }>;
  /** Epoch ms when the current countdown/intermission ends. */
  phaseEndsAt: number | null;
  countdownSec: number;
  intermissionSec: number;
  votingEnabled: boolean;
  votes: Record<string, number>;
  myVote?: string | null;
  totalRuntimeSec: number;
  estimatedFinishAt: number | null;
  error: string | null;
}

export interface ChatMessageDto {
  id: string;
  roomId: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  kind: 'USER' | 'SYSTEM';
  author: { id: string; displayName: string; avatarUrl: string | null; isGuest: boolean } | null;
  replyTo: { id: string; body: string; authorName: string | null } | null;
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
  clientId?: string;
}

export interface ReactionBurst {
  roomId: string;
  emoji: ReactionEmoji;
  userId: string;
  displayName: string;
  at: number;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
