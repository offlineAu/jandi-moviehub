import type { PlaybackState } from './events';

export const MIN_RATE = 0.25;
export const MAX_RATE = 2;

/** Expected media position (seconds) of a playback state at the given server time. */
export function expectedPosition(state: PlaybackState, serverNow: number): number {
  if (state.status !== 'playing') return state.positionSec;
  const elapsed = Math.max(0, serverNow - state.anchorServerTime) / 1000;
  const position = state.positionSec + elapsed * state.rate;
  return state.durationSec != null ? Math.min(position, state.durationSec) : position;
}

export interface CorrectionThresholds {
  /** Drift (s) below which no correction is applied. */
  ignoreSec: number;
  /** Drift (s) above which the client hard-seeks instead of nudging the rate. */
  seekSec: number;
  /** Maximum fractional playback-rate change used for gentle correction. */
  maxRateNudge: number;
  /** Fractional rate change applied per second of drift (capped at maxRateNudge). */
  nudgeGain: number;
}

export const DEFAULT_THRESHOLDS: CorrectionThresholds = {
  ignoreSec: 0.12,
  seekSec: 1.0,
  maxRateNudge: 0.08,
  nudgeGain: 0.1,
};

export type Correction =
  | { kind: 'none'; rate: number }
  | { kind: 'rate'; rate: number }
  | { kind: 'seek'; toSec: number; rate: number };

/**
 * Decide how a client should correct its local playback.
 * `driftSec` is local − expected (positive means the client is ahead).
 */
export function decideCorrection(
  driftSec: number,
  expectedSec: number,
  baseRate: number,
  playing: boolean,
  thresholds: CorrectionThresholds = DEFAULT_THRESHOLDS,
): Correction {
  const magnitude = Math.abs(driftSec);
  if (!playing) {
    return magnitude > thresholds.ignoreSec
      ? { kind: 'seek', toSec: expectedSec, rate: baseRate }
      : { kind: 'none', rate: baseRate };
  }
  if (magnitude < thresholds.ignoreSec) return { kind: 'none', rate: baseRate };
  if (magnitude >= thresholds.seekSec) return { kind: 'seek', toSec: expectedSec, rate: baseRate };
  const nudge = Math.min(thresholds.maxRateNudge, magnitude * thresholds.nudgeGain);
  const rate = baseRate * (driftSec > 0 ? 1 - nudge : 1 + nudge);
  return { kind: 'rate', rate: Math.round(rate * 1000) / 1000 };
}

export interface ClockSample {
  offsetMs: number;
  rttMs: number;
}

/**
 * NTP-style clock offset estimator. Keeps the most recent samples and trusts
 * the ones with the lowest round-trip time, which have the least asymmetry error.
 */
export class ClockSync {
  private samples: ClockSample[] = [];

  constructor(private readonly maxSamples = 10) {}

  /** Record a ping: client send time, server time, client receive time (all ms). */
  addSample(clientSentAt: number, serverTime: number, clientReceivedAt: number): ClockSample {
    const rttMs = Math.max(0, clientReceivedAt - clientSentAt);
    const offsetMs = serverTime - (clientSentAt + rttMs / 2);
    const sample = { offsetMs, rttMs };
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
    return sample;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** Median offset of the lowest-RTT half of the samples. */
  get offsetMs(): number {
    if (this.samples.length === 0) return 0;
    const best = [...this.samples]
      .sort((a, b) => a.rttMs - b.rttMs)
      .slice(0, Math.max(1, Math.ceil(this.samples.length / 2)))
      .map((s) => s.offsetMs)
      .sort((a, b) => a - b);
    const mid = Math.floor(best.length / 2);
    return best.length % 2 ? best[mid]! : (best[mid - 1]! + best[mid]!) / 2;
  }

  get rttMs(): number {
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples.map((s) => s.rttMs));
  }

  /** Current server time estimated from the local clock. */
  serverNow(localNow: number = Date.now()): number {
    return localNow + this.offsetMs;
  }
}

export function clampRate(rate: number): number {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}
