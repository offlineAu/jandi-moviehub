import { afterEach, expect, it, vi } from 'vitest';
import { recentlyFailedPlayback, rememberPlaybackOutcome } from './playback-evidence';

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});
it('isolates failure by title and provider, clears it on success, and expires it', () => {
  vi.useFakeTimers();
  rememberPlaybackOutcome('a', 'kisskh-direct', 'failed');
  expect(recentlyFailedPlayback('a', 'kisskh-direct')).toBe(true);
  expect(recentlyFailedPlayback('b', 'kisskh-direct')).toBe(false);
  expect(recentlyFailedPlayback('a', 'vidsrc')).toBe(false);
  rememberPlaybackOutcome('a', 'kisskh-direct', 'started');
  expect(recentlyFailedPlayback('a', 'kisskh-direct')).toBe(false);
  rememberPlaybackOutcome('a', 'kisskh-direct', 'failed');
  vi.advanceTimersByTime(10 * 60_000);
  expect(recentlyFailedPlayback('a', 'kisskh-direct')).toBe(false);
});
