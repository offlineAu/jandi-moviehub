import type { PlaybackSource } from '@/lib/types';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const HLS_MIME = 'application/vnd.apple.mpegurl';
export const VOLUME_STORAGE_KEY = 'jandi:player-volume';

/** Formats seconds as m:ss or h:mm:ss. Invalid / negative input renders as 0:00. */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Spoken form for aria-valuetext, e.g. "1 hour 2 minutes 3 seconds". */
export function formatTimeVerbose(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const s = Math.floor(totalSeconds);
  const parts: string[] = [];
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (sec || parts.length === 0) parts.push(`${sec} second${sec === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type PlaybackEngine = 'native' | 'hls.js';

export interface SelectedSource {
  source: PlaybackSource;
  engine: PlaybackEngine;
}

export interface SourceSupport {
  /** `HTMLMediaElement.canPlayType` (returns '', 'maybe' or 'probably'). */
  canPlayType: (mimeType: string) => string;
  /** Whether hls.js can run here (Media Source Extensions available). */
  hlsJsSupported: boolean;
  /** Prefer the browser player on iOS, where native HLS is well supported. */
  preferNativeHls?: boolean;
}

/**
 * Picks the first playable source, in API order.
 * WEBM/MP4 → native `src` when the browser can play the MIME type.
 * HLS → native on iOS when available; otherwise prefer hls.js when MSE exists.
 */
export function selectSource(
  sources: readonly PlaybackSource[],
  support: SourceSupport,
): SelectedSource | null {
  for (const source of sources) {
    if (source.format === 'HLS') {
      if (support.preferNativeHls !== false && support.canPlayType(HLS_MIME) !== '')
        return { source, engine: 'native' };
      if (support.hlsJsSupported) return { source, engine: 'hls.js' };
      if (support.canPlayType(HLS_MIME) !== '') return { source, engine: 'native' };
      continue;
    }
    const mime = source.mimeType || (source.format === 'WEBM' ? 'video/webm' : 'video/mp4');
    if (support.canPlayType(mime) !== '') return { source, engine: 'native' };
  }
  return null;
}

export interface Range {
  start: number;
  end: number;
}

export function timeRangesToArray(ranges: TimeRanges | null | undefined): Range[] {
  if (!ranges) return [];
  const out: Range[] = [];
  for (let i = 0; i < ranges.length; i += 1)
    out.push({ start: ranges.start(i), end: ranges.end(i) });
  return out;
}

/** Snap a (possibly sync-nudged) playback rate to the nearest menu option for display. */
export function nominalRate(rate: number): number {
  let best: number = PLAYBACK_RATES[0];
  for (const r of PLAYBACK_RATES) if (Math.abs(r - rate) < Math.abs(best - rate)) best = r;
  return Math.abs(best - rate) <= 0.1 ? best : rate;
}

export type ShortcutAction =
  | { kind: 'toggle-play' }
  | { kind: 'seek-by'; seconds: number }
  | { kind: 'volume-by'; delta: number }
  | { kind: 'toggle-mute' }
  | { kind: 'toggle-fullscreen' }
  | { kind: 'toggle-captions' }
  | { kind: 'toggle-theater' }
  | { kind: 'next' }
  | { kind: 'previous' };

/** Maps a keyboard event to a player action (pure; used by the player's keydown handler). */
export function shortcutFor(event: {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (event.shiftKey) {
    if (key === 'n') return { kind: 'next' };
    if (key === 'p') return { kind: 'previous' };
  }
  switch (key) {
    case ' ':
    case 'k':
      return { kind: 'toggle-play' };
    case 'j':
      return { kind: 'seek-by', seconds: -10 };
    case 'l':
      return { kind: 'seek-by', seconds: 10 };
    case 'ArrowLeft':
      return { kind: 'seek-by', seconds: -5 };
    case 'ArrowRight':
      return { kind: 'seek-by', seconds: 5 };
    case 'ArrowUp':
      return { kind: 'volume-by', delta: 0.05 };
    case 'ArrowDown':
      return { kind: 'volume-by', delta: -0.05 };
    case 'm':
      return { kind: 'toggle-mute' };
    case 'f':
      return { kind: 'toggle-fullscreen' };
    case 'c':
      return { kind: 'toggle-captions' };
    case 't':
      return { kind: 'toggle-theater' };
    default:
      return null;
  }
}

/** Reads the remembered volume, falling back to the user's default. */
export function readStoredVolume(fallback: number): { volume: number; muted: boolean } {
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (!raw) return { volume: clamp(fallback, 0, 1), muted: false };
    const parsed = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
    const volume =
      typeof parsed.volume === 'number' ? clamp(parsed.volume, 0, 1) : clamp(fallback, 0, 1);
    return { volume, muted: parsed.muted === true };
  } catch {
    return { volume: clamp(fallback, 0, 1), muted: false };
  }
}

export function storeVolume(volume: number, muted: boolean) {
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    /* storage unavailable */
  }
}

/** Keep original text-track indexes while making English easy to find. */
export function orderCaptionChoices<T extends { lang: string; label: string }>(choices: T[]): T[] {
  const english = (choice: T) => /^(en|eng)(?:-|$)/i.test(choice.lang);
  const alternative = (choice: T) => /\(alternative\b/i.test(choice.label);
  return [...choices].sort(
    (a, b) =>
      Number(english(b)) - Number(english(a)) || Number(alternative(a)) - Number(alternative(b)),
  );
}
