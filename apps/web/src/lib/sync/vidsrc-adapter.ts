import type { ExternalMedia } from '@jandi/shared';
import type { PlaybackAdapter } from './player-adapter';

export const VIDSRC_ORIGIN = 'https://vidsrc.sh';
export type EmbedStatus = 'activation' | 'ready' | 'unknown' | 'failed';
export type VidsrcSample = {
  status: 'playing' | 'paused' | 'seeked' | 'completed';
  position: number;
  duration: number;
};

/** Reject stale frames, foreign origins, malformed payloads, and other episodes. */
export function parseVidsrcEvent(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  frame: Window | null,
  media: ExternalMedia,
): VidsrcSample | null {
  if (!frame || event.origin !== VIDSRC_ORIGIN || event.source !== frame) return null;
  let payload: unknown = event.data;
  if (typeof payload === 'string') {
    if (payload.length > 10000) return null;
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('type' in payload) ||
    payload.type !== 'PLAYER_EVENT' ||
    !('data' in payload)
  )
    return null;
  const data = payload.data;
  if (!data || typeof data !== 'object') return null;
  const {
    player_info: info,
    player_status: status,
    player_progress: position,
    player_duration: duration,
  } = data as Record<string, unknown>;
  if (!info || typeof info !== 'object') return null;
  const identity = info as Record<string, unknown>;
  if (
    Number(identity.tmdb) !== media.tmdbId ||
    identity.mediaType !== media.type ||
    (media.type === 'tv' &&
      (Number(identity.season) !== media.season || Number(identity.episode) !== media.episode))
  )
    return null;
  if (
    !['playing', 'paused', 'seeked', 'completed'].includes(String(status)) ||
    typeof position !== 'number' ||
    !Number.isFinite(position) ||
    position < 0 ||
    position > 86400 ||
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 86400 ||
    position > duration + 2
  )
    return null;
  return { status: status as VidsrcSample['status'], position, duration };
}

export class VidsrcAdapter extends EventTarget implements PlaybackAdapter {
  readonly supportsRate = false;
  private activated = false;
  private firstEventAt: number | null = null;
  private events = 0;
  private readonly createdAt: number;
  private position = 0;
  private sampledAt = 0;
  private stopped = true;
  private disposed = false;
  private failed = false;
  private pending = new Map<string, { until: number; position?: number }>();
  duration = 0;
  playbackRate = 1;
  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly media: ExternalMedia,
    private readonly now: () => number = Date.now,
  ) {
    super();
    this.createdAt = now();
  }
  get diagnostics() {
    return {
      startupMs: this.firstEventAt === null ? null : this.firstEventAt - this.createdAt,
      acceptedEvents: this.events,
      lastEventAgeMs: this.firstEventAt === null ? null : Math.max(0, this.now() - this.sampledAt),
    };
  }
  get status(): EmbedStatus {
    if (this.failed) return 'failed';
    if (!this.activated) return this.now() - this.createdAt > 30000 ? 'unknown' : 'activation';
    const unconfirmedPlay = this.pending.get('playing');
    if (this.stopped && unconfirmedPlay && this.now() > unconfirmedPlay.until) return 'unknown';
    return !this.stopped && this.now() - this.sampledAt > 15000 ? 'unknown' : 'ready';
  }
  get readyState() {
    return !this.disposed && this.status === 'ready' ? 4 : 0;
  }
  get paused() {
    return this.stopped;
  }
  get currentTime() {
    return Math.min(
      this.duration || Infinity,
      this.position +
        (!this.stopped ? Math.min(15000, Math.max(0, this.now() - this.sampledAt)) / 1000 : 0),
    );
  }
  set currentTime(value: number) {
    if (!Number.isFinite(value) || !this.readyState) return;
    const position = Math.max(0, Math.min(this.duration || 86400, value));
    this.pending.set('seeked', { until: this.now() + 10000, position });
    this.send(`seek${position.toFixed(3)}`);
  }
  private send(action: string) {
    if (!this.disposed && this.activated)
      this.frame.contentWindow?.postMessage({ player: true, action }, VIDSRC_ORIGIN);
  }
  async play() {
    if (!this.readyState) return;
    if ((this.pending.get('playing')?.until ?? 0) > this.now()) return;
    this.pending.set('playing', { until: this.now() + 10000 });
    this.send('play');
  }
  pause() {
    if (!this.readyState) return;
    if ((this.pending.get('paused')?.until ?? 0) > this.now()) return;
    this.pending.set('paused', { until: this.now() + 10000 });
    this.send('pause');
  }
  accept(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>) {
    if (this.disposed) return false;
    const sample = parseVidsrcEvent(event, this.frame.contentWindow, this.media);
    if (!sample) return false;
    const first = !this.activated;
    this.events += 1;
    if (this.firstEventAt === null) this.firstEventAt = this.now();
    const wasPaused = this.stopped;
    this.failed = false;
    this.activated = true;
    this.position = sample.position;
    this.duration = sample.duration;
    this.sampledAt = this.now();
    if (sample.status === 'playing') this.stopped = false;
    if (sample.status === 'paused' || sample.status === 'completed') this.stopped = true;
    const pending = this.pending.get(sample.status);
    const echo =
      !!pending &&
      pending.until >= this.now() &&
      (pending.position === undefined || Math.abs(pending.position - sample.position) <= 2);
    if (echo) this.pending.delete(sample.status);
    if (first) this.dispatchEvent(new Event('loadedmetadata'));
    else if (!echo) {
      if (sample.status !== 'completed' && wasPaused !== this.stopped)
        this.dispatchEvent(new Event(this.stopped ? 'pause' : 'play'));
      if (sample.status === 'seeked') this.dispatchEvent(new Event('seeking'));
    }
    if (sample.status === 'playing') this.dispatchEvent(new Event('playing'));
    if (sample.status === 'completed') this.dispatchEvent(new Event('ended'));
    this.dispatchEvent(new Event('timeupdate'));
    return true;
  }
  fail() {
    this.failed = true;
  }
  destroy() {
    this.disposed = true;
    this.pending.clear();
  }
}
