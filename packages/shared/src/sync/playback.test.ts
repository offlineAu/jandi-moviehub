import { describe, expect, it } from 'vitest';
import type { PlaybackState } from './events';
import { ClockSync, decideCorrection, expectedPosition } from './playback';

const base: PlaybackState = {
  roomId: 'r',
  version: 1,
  movieId: 'm',
  mediaAssetId: 'a',
  status: 'playing',
  positionSec: 10,
  rate: 1,
  anchorServerTime: 1_000_000,
  durationSec: 100,
  updatedBy: null,
  lastCommandId: null,
};

describe('expectedPosition', () => {
  it('advances with time while playing', () => {
    expect(expectedPosition(base, 1_005_000)).toBeCloseTo(15);
  });
  it('honours playback rate', () => {
    expect(expectedPosition({ ...base, rate: 2 }, 1_005_000)).toBeCloseTo(20);
  });
  it('is frozen while paused', () => {
    expect(expectedPosition({ ...base, status: 'paused' }, 9_999_999)).toBe(10);
  });
  it('clamps to duration', () => {
    expect(expectedPosition(base, 2_000_000)).toBe(100);
  });
  it('never goes backwards for anchor in the future', () => {
    expect(expectedPosition(base, 999_000)).toBe(10);
  });
});

describe('decideCorrection', () => {
  it('ignores insignificant drift', () => {
    expect(decideCorrection(0.05, 10, 1, true)).toEqual({ kind: 'none', rate: 1 });
  });
  it('slows down gently when slightly ahead', () => {
    const c = decideCorrection(0.4, 10, 1, true);
    expect(c.kind).toBe('rate');
    expect(c.rate).toBeLessThan(1);
    expect(c.rate).toBeGreaterThanOrEqual(0.92);
  });
  it('speeds up gently when slightly behind', () => {
    const c = decideCorrection(-0.4, 10, 1, true);
    expect(c.kind).toBe('rate');
    expect(c.rate).toBeGreaterThan(1);
    expect(c.rate).toBeLessThanOrEqual(1.08);
  });
  it('seeks for large drift', () => {
    expect(decideCorrection(3, 42, 1, true)).toEqual({ kind: 'seek', toSec: 42, rate: 1 });
  });
  it('seeks when paused and misaligned', () => {
    expect(decideCorrection(0.5, 12, 1, false)).toMatchObject({ kind: 'seek', toSec: 12 });
  });
  it('scales nudges relative to the base rate', () => {
    const c = decideCorrection(-0.5, 10, 1.5, true);
    expect(c.rate).toBeGreaterThan(1.5);
  });
});

describe('ClockSync', () => {
  it('estimates offset from symmetric pings', () => {
    const clock = new ClockSync();
    // server is 500ms ahead, rtt 40ms
    clock.addSample(1000, 1520, 1040);
    expect(clock.offsetMs).toBe(500);
    expect(clock.rttMs).toBe(40);
  });
  it('prefers low-RTT samples', () => {
    const clock = new ClockSync();
    clock.addSample(0, 520, 40); // offset 500, rtt 40
    clock.addSample(0, 1000, 1000); // offset 500, rtt 1000 but noisy
    clock.addSample(0, 2000, 900); // offset 1550, rtt 900 (asymmetric)
    clock.addSample(0, 521, 42); // offset 500, rtt 42
    expect(Math.abs(clock.offsetMs - 500)).toBeLessThan(2);
  });
  it('keeps a bounded window', () => {
    const clock = new ClockSync(3);
    for (let i = 0; i < 10; i++) clock.addSample(0, 100, 0);
    expect(clock.sampleCount).toBe(3);
  });
});
