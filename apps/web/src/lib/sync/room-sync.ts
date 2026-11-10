import { NativePlayerAdapter, type PlaybackAdapter } from './player-adapter';
import {
  ClockSync,
  playbackAssetKey,
  type CommandAck,
  decideCorrection,
  DEFAULT_THRESHOLDS,
  expectedPosition,
  type PlaybackState,
  type RoomSnapshot,
  SocketEvents,
} from '@jandi/shared';

/** Minimal socket surface the engine needs (Socket.IO client compatible). */
export interface SyncSocket {
  connected: boolean;
  on(event: string, fn: (...args: never[]) => void): unknown;
  off(event: string, fn: (...args: never[]) => void): unknown;
  timeout(ms: number): { emitWithAck(event: string, payload: unknown): Promise<unknown> };
}

export type PlayerIntent =
  | { type: 'play' | 'pause' }
  | { type: 'seek'; positionSec: number }
  | { type: 'rate'; rate: number }
  | { type: 'duration'; durationSec: number };

export interface SyncStats {
  driftMs: number | null;
  buffering: boolean;
  offsetMs: number;
  rttMs: number;
  corrections: { seeks: number; rateNudges: number };
}

export interface RoomSyncOptions {
  /** Drift loop interval. */
  tickMs?: number;
  heartbeatMs?: number;
  clockPingMs?: number;
  /** Minimum time between corrective seeks, to avoid seek loops on slow networks. */
  seekCooldownMs?: number;
  now?: () => number;
  onState?: (state: PlaybackState) => void;
  onStats?: (stats: SyncStats) => void;
  onNeedsInteraction?: (needed: boolean) => void;
  onError?: (message: string) => void;
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Client side of the server-authoritative sync protocol.
 *
 * - Local UI controls are *intents*: they become commands, and the element only changes when
 *   the server broadcasts the new authoritative state.
 * - Changes the engine makes to the element are flagged, so they are never mistaken for user
 *   actions (no feedback loops).
 * - Changes made outside the engine (media keys, OS PiP controls) are turned into commands for
 *   controllers and reverted for everyone else.
 * - A drift loop compares the element to `expectedPosition(state, serverNow)` and corrects with
 *   a playback-rate nudge or, for large drift, a (rate-limited) seek.
 */
export class RoomSyncEngine {
  readonly clock = new ClockSync(10);
  private state: PlaybackState | null = null;
  private video: PlaybackAdapter | null = null;
  private canControl = false;
  private applying = 0;
  private lastSeekAt = -Infinity;
  private needsInteraction = false;
  private buffering = false;
  private lastDriftMs: number | null = null;
  private corrections = { seeks: 0, rateNudges: 0 };
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private readonly now: () => number;
  private readonly opts: Required<
    Pick<RoomSyncOptions, 'tickMs' | 'heartbeatMs' | 'clockPingMs' | 'seekCooldownMs'>
  >;
  private readonly listeners: Array<[string, (...args: never[]) => void]> = [];
  private readonly videoListeners: Array<[string, EventListener]> = [];
  private destroyed = false;

  constructor(
    private readonly socket: SyncSocket,
    private readonly roomId: string,
    private readonly options: RoomSyncOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.opts = {
      tickMs: options.tickMs ?? 500,
      heartbeatMs: options.heartbeatMs ?? 5000,
      clockPingMs: options.clockPingMs ?? 15_000,
      seekCooldownMs: options.seekCooldownMs ?? 2000,
    };
    this.listen(SocketEvents.PLAYBACK_SYNC, (payload: { state: PlaybackState }) =>
      this.receive(payload.state),
    );
    this.listen(SocketEvents.MOVIE_CHANGE, (payload: { state: PlaybackState }) =>
      this.receive(payload.state),
    );
  }

  private listen(event: string, fn: (...args: never[]) => void) {
    this.socket.on(event, fn);
    this.listeners.push([event, fn]);
  }

  get current() {
    return this.state;
  }

  get serverNow() {
    return this.clock.serverNow(this.now());
  }

  setCanControl(canControl: boolean) {
    this.canControl = canControl;
  }

  // ───────── Lifecycle ─────────

  /** Joins the room channel, measures clock offset and starts the sync loops. */
  async join(): Promise<RoomSnapshot> {
    const ack = (await this.socket
      .timeout(8000)
      .emitWithAck(SocketEvents.ROOM_JOIN, { roomId: this.roomId })) as CommandAck<RoomSnapshot>;
    if (!ack.ok) throw new Error(ack.error.message);
    await this.measureClock(5);
    this.canControl = ack.data.you.canControl;
    this.receive(ack.data.playback, true);
    this.start();
    return ack.data;
  }

  private start() {
    this.stopTimers();
    this.timers.push(setInterval(() => this.tick(), this.opts.tickMs));
    this.timers.push(setInterval(() => void this.heartbeat(), this.opts.heartbeatMs));
    this.timers.push(setInterval(() => void this.measureClock(1), this.opts.clockPingMs));
  }

  private stopTimers() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  destroy() {
    this.destroyed = true;
    this.stopTimers();
    for (const [event, fn] of this.listeners) this.socket.off(event, fn);
    this.attachVideo(null);
  }

  async measureClock(samples: number) {
    for (let i = 0; i < samples; i++) {
      const sent = this.now();
      try {
        const res = (await this.socket
          .timeout(3000)
          .emitWithAck(SocketEvents.CLOCK_PING, { clientSentAt: sent })) as {
          serverTime: number;
        };
        this.clock.addSample(sent, res.serverTime, this.now());
      } catch {
        // Missed pings just reduce sample count.
      }
    }
    this.emitStats();
  }

  // ───────── Video element ─────────

  attachVideo(video: HTMLVideoElement | null) {
    this.attachPlayer(video ? new NativePlayerAdapter(video) : null);
  }

  attachPlayer(video: PlaybackAdapter | null) {
    if (this.video)
      for (const [e, fn] of this.videoListeners) this.video.removeEventListener(e, fn);
    this.videoListeners.length = 0;
    this.video = video;
    this.lastSeekAt = -Infinity;
    this.lastDriftMs = null;
    this.setBuffering(false);
    this.emitStats();
    if (!video) return;
    const on = (event: string, fn: () => void) => {
      video.addEventListener(event, fn);
      this.videoListeners.push([event, fn]);
    };
    on('play', () => this.onExternalChange('play'));
    on('pause', () => this.onExternalChange('pause'));
    if (!video.supportsRate) on('ended', () => void this.reportEnded());
    if (!video.supportsRate)
      on('seeking', () => {
        if (this.destroyed || this.applying || !this.state) return;
        if (this.canControl) void this.intent({ type: 'seek', positionSec: video.currentTime });
        else this.apply(true);
      });
    on('waiting', () => this.setBuffering(true));
    on('playing', () => this.setBuffering(false));
    on('loadedmetadata', () => this.apply(true));
    if (this.state) this.apply(true);
  }

  /** Called after a user gesture when autoplay was blocked. */
  async resumeLocal() {
    this.needsInteraction = false;
    this.options.onNeedsInteraction?.(false);
    this.apply(true);
  }

  private guard<T>(fn: () => T): T {
    this.applying += 1;
    try {
      return fn();
    } finally {
      // Media events fire asynchronously; keep the guard up for the current task.
      setTimeout(() => (this.applying -= 1), 0);
    }
  }

  /** A play/pause the engine did not cause (media keys, OS controls, PiP window). */
  private onExternalChange(kind: 'play' | 'pause') {
    if (this.applying > 0 || !this.state || this.destroyed) return;
    const shouldPlay = this.state.status === 'playing';
    if ((kind === 'play') === shouldPlay) return;
    if (this.canControl) void this.intent({ type: kind });
    else this.apply(true);
  }

  private setBuffering(buffering: boolean) {
    if (this.buffering === buffering) return;
    this.buffering = buffering;
    this.emitStats();
    void this.socket
      .timeout(3000)
      .emitWithAck(buffering ? SocketEvents.PLAYBACK_BUFFERING : SocketEvents.PLAYBACK_RECOVERED, {
        roomId: this.roomId,
      })
      .catch(() => undefined);
  }

  // ───────── Authoritative state ─────────

  private receive(state: PlaybackState, force = false) {
    if (!force && this.state && state.version < this.state.version) return; // out-of-order
    // A new asset means the player is about to swap sources; 'loadedmetadata' re-applies then.
    const movieChanged = !!this.state && playbackAssetKey(this.state) !== playbackAssetKey(state);
    if (force || !this.state || state.version > this.state.version) this.lastSeekAt = -Infinity;
    this.state = state;
    this.options.onState?.(state);
    this.apply(true, movieChanged);
  }

  /**
   * Drives the element towards the authoritative state. `hard` applies play/pause and seeks
   * immediately (used on state changes); otherwise only drift correction runs.
   */
  private apply(hard = false, movieChanged = false) {
    const video = this.video;
    const state = this.state;
    if (video && !video.supportsRate && !this.socket.connected) return;
    if (!video || !state || !playbackAssetKey(state) || video.readyState < 1 || movieChanged)
      return;
    const expected = expectedPosition(state, this.serverNow);
    const playing = state.status === 'playing';
    const drift = video.currentTime - expected;
    if (!playing && this.buffering) this.setBuffering(false);

    if (
      hard &&
      Math.abs(drift) > (video.supportsRate ? DEFAULT_THRESHOLDS.ignoreSec : 2) &&
      (video.supportsRate || this.now() - this.lastSeekAt >= 10000)
    ) {
      this.guard(() => (video.currentTime = expected + (playing ? 0.05 : 0)));
      this.lastSeekAt = this.now();
    }
    if (playing && video.paused) {
      this.guard(() => {
        const p = video.play();
        if (p && typeof p.catch === 'function') {
          p.catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
              this.needsInteraction = true;
              this.options.onNeedsInteraction?.(true);
            }
          });
        }
      });
    } else if (!playing && !video.paused) {
      this.guard(() => video.pause());
    }
    if (video.supportsRate && !playing && video.playbackRate !== state.rate)
      this.guard(() => (video.playbackRate = state.rate));
  }

  /** Drift loop: measure and correct gently. */
  tick() {
    const video = this.video;
    const state = this.state;
    if (
      !video ||
      !state ||
      !playbackAssetKey(state) ||
      video.readyState < 2 ||
      this.needsInteraction
    )
      return;
    if (!video.supportsRate && !this.socket.connected) return;
    const playing = state.status === 'playing';
    const expected = expectedPosition(state, this.serverNow);
    const driftSec = video.currentTime - expected;
    this.lastDriftMs = Math.round(driftSec * 1000);

    if (playing && video.paused) return this.apply(true);
    if (!playing && !video.paused) return this.apply(true);

    if (!video.supportsRate) {
      if (Math.abs(driftSec) > 2 && this.now() - this.lastSeekAt >= 10000) {
        this.lastSeekAt = this.now();
        this.corrections.seeks += 1;
        this.guard(() => {
          video.currentTime = expected;
        });
      }
      this.emitStats();
      return;
    }
    // A stalled player cannot catch up. Seeking repeatedly while it buffers can restart
    // network loading, so wait for playback to recover before correcting its position.
    if (this.buffering && playing) {
      this.emitStats();
      return;
    }
    const correction = decideCorrection(driftSec, expected, state.rate, playing);
    if (correction.kind === 'seek') {
      if (this.now() - this.lastSeekAt < this.opts.seekCooldownMs) {
        this.emitStats();
        return;
      }
      this.lastSeekAt = this.now();
      this.corrections.seeks += 1;
      this.guard(() => {
        video.currentTime = correction.toSec + (playing ? 0.05 : 0);
        video.playbackRate = state.rate;
      });
    } else if (correction.rate !== video.playbackRate) {
      if (correction.kind === 'rate') this.corrections.rateNudges += 1;
      this.guard(() => (video.playbackRate = correction.rate));
    }
    this.emitStats();
  }

  private async heartbeat() {
    const video = this.video;
    const state = this.state;
    if (!video || !state || !this.socket.connected || video.readyState < 2) return;
    const expected = expectedPosition(state, this.serverNow);
    await this.socket
      .timeout(3000)
      .emitWithAck(SocketEvents.PLAYBACK_HEARTBEAT, {
        roomId: this.roomId,
        version: state.version,
        positionSec: Math.max(0, video.currentTime),
        driftSec: video.currentTime - expected,
        buffering: this.buffering,
        rttMs: Math.round(this.clock.rttMs),
      })
      .catch(() => undefined);
  }

  private emitStats() {
    this.options.onStats?.({
      driftMs: this.lastDriftMs,
      buffering: this.buffering,
      offsetMs: Math.round(this.clock.offsetMs),
      rttMs: Math.round(this.clock.rttMs),
      corrections: { ...this.corrections },
    });
  }

  // ───────── Commands ─────────

  /**
   * Sends a user intent as a command. On STALE the engine adopts the fresh state and retries
   * once — play/pause/seek/rate are absolute, so a retry is safe.
   */
  async intent(intent: PlayerIntent, retry = true): Promise<boolean> {
    const state = this.state;
    if (!state) return false;
    if (!this.canControl) {
      this.options.onError?.('Only hosts can control playback in this room');
      this.apply(true);
      return false;
    }
    if (intent.type === 'rate' && this.video && !this.video.supportsRate) return false;
    const event = {
      play: SocketEvents.PLAYBACK_PLAY,
      pause: SocketEvents.PLAYBACK_PAUSE,
      seek: SocketEvents.PLAYBACK_SEEK,
      rate: SocketEvents.PLAYBACK_RATE_CHANGE,
      duration: SocketEvents.PLAYBACK_METADATA,
    }[intent.type];
    const payload: Record<string, unknown> = {
      roomId: this.roomId,
      commandId: uuid(),
      baseVersion: state.version,
    };
    if (intent.type === 'seek') payload.positionSec = Math.max(0, intent.positionSec);
    if (intent.type === 'rate') payload.rate = intent.rate;
    if (intent.type === 'duration') payload.durationSec = intent.durationSec;
    if (intent.type === 'pause' && this.video)
      payload.positionSec = Math.max(0, this.video.currentTime);

    let ack: CommandAck<PlaybackState>;
    try {
      ack = (await this.socket
        .timeout(5000)
        .emitWithAck(event, payload)) as CommandAck<PlaybackState>;
    } catch {
      this.options.onError?.('Connection problem — command not delivered');
      this.apply(true);
      return false;
    }
    if (ack.ok) {
      this.receive(ack.data);
      return true;
    }
    if (ack.state) this.receive(ack.state, true);
    if (ack.error.code === 'STALE' && retry) return this.intent(intent, false);
    this.options.onError?.(ack.error.message);
    return false;
  }

  /** Reports a natural end; the server validates it against its own clock. */
  async reportEnded() {
    const state = this.state;
    if (!state || state.status !== 'playing') return;
    await this.socket
      .timeout(3000)
      .emitWithAck(SocketEvents.MOVIE_END, {
        roomId: this.roomId,
        version: state.version,
        positionSec: this.video?.currentTime ?? 0,
      })
      .catch(() => undefined);
  }
}
