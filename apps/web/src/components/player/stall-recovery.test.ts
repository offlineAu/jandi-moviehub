import { afterEach, expect, it, vi } from 'vitest';
import { createStallRecovery } from './stall-recovery';
afterEach(() => vi.useRealTimers());
it('retries a stalled HLS load at the current position at most twice', () => {
  vi.useFakeTimers();
  const retry = vi.fn(() => true);
  const recovery = createStallRecovery({
    position: () => 42,
    isPlaying: () => true,
    retry,
    delayMs: 1000,
  });
  recovery.wait();
  recovery.wait();
  vi.advanceTimersByTime(3000);
  expect(retry).toHaveBeenCalledTimes(2);
  expect(retry).toHaveBeenCalledWith(42);
  recovery.dispose();
});
it('does not retry when playback advances or is paused', () => {
  vi.useFakeTimers();
  let position = 42;
  let playing = true;
  const retry = vi.fn(() => true);
  const recovery = createStallRecovery({
    position: () => position,
    isPlaying: () => playing,
    retry,
    delayMs: 1000,
  });
  recovery.wait();
  position++;
  recovery.progress();
  vi.advanceTimersByTime(1000);
  expect(retry).not.toHaveBeenCalled();
  recovery.wait();
  playing = false;
  vi.advanceTimersByTime(1000);
  expect(retry).not.toHaveBeenCalled();
});
it('cancels pending retries on disposal', () => {
  vi.useFakeTimers();
  const retry = vi.fn(() => true);
  const recovery = createStallRecovery({
    position: () => 1,
    isPlaying: () => true,
    retry,
    delayMs: 1000,
  });
  recovery.wait();
  recovery.dispose();
  vi.advanceTimersByTime(2000);
  expect(retry).not.toHaveBeenCalled();
});
