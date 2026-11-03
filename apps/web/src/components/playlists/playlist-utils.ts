import type { PlaylistVisibility } from '@jandi/shared';

/** "2h 05m"-style total for a playlist; minutes are rounded, never negative. */
export function formatTotalRuntime(totalSec: number | null | undefined): string {
  if (!totalSec || !Number.isFinite(totalSec) || totalSec <= 0) return '0m';
  const minutes = Math.round(totalSec / 60);
  if (minutes === 0) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Longer, screen-reader friendly variant: "2 hours 5 minutes". */
export function describeTotalRuntime(totalSec: number | null | undefined): string {
  if (!totalSec || !Number.isFinite(totalSec) || totalSec <= 0) return 'no runtime';
  const minutes = Math.max(1, Math.round(totalSec / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

/** Returns a copy of `list` with the element at `from` moved to index `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  if (target === from) return next;
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

/**
 * Index an item dragged to `pointerY` should land at, given the vertical midpoints of the
 * *other* rows in their current order (the dragged row excluded). Result is 0..midpoints.length.
 */
export function dropIndex(pointerY: number, midpoints: readonly number[]): number {
  let index = 0;
  for (const mid of midpoints) {
    if (pointerY > mid) index += 1;
    else break;
  }
  return index;
}

/** True when two id orders differ (used to skip no-op reorder requests). */
export function orderChanged(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((id, i) => id !== b[i]);
}

export const VISIBILITY_COPY: Record<
  PlaylistVisibility,
  { label: string; description: string; share: string }
> = {
  PRIVATE: {
    label: 'Private',
    description: 'Only you and collaborators can open it.',
    share: 'This playlist is private — only you and collaborators can open the link.',
  },
  UNLISTED: {
    label: 'Unlisted',
    description: 'Anyone with the link can view it; it isn’t listed publicly.',
    share:
      'Unlisted: anyone signed in with the link can view it, but it won’t appear in public playlists.',
  },
  PUBLIC: {
    label: 'Public',
    description: 'Listed in public playlists for everyone to discover.',
    share: 'Public: anyone can find it under public playlists and open the link.',
  },
};

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
