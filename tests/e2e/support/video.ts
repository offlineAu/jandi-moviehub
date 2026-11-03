import { expect, type Page } from '@playwright/test';

export interface VideoSample {
  /** Wall-clock timestamp of the read, ms (performance.timeOrigin + performance.now()). */
  t: number;
  ct: number;
  paused: boolean;
  rate: number;
  readyState: number;
  src: string;
}

export async function videoSample(page: Page): Promise<VideoSample | null> {
  return page.evaluate(() => {
    const v = document.querySelector('video');
    const t = performance.timeOrigin + performance.now();
    if (!v) return null;
    return {
      t,
      ct: v.currentTime,
      paused: v.paused,
      rate: v.playbackRate,
      readyState: v.readyState,
      src: v.currentSrc,
    };
  });
}

/**
 * |host − viewer| in ms, with the viewer's position projected to the instant the host was read
 * (the two evaluations do not run at exactly the same moment).
 */
export function driftMs(host: VideoSample, viewer: VideoSample): number {
  const dtSec = (host.t - viewer.t) / 1000;
  const viewerAtHostT = viewer.ct + (viewer.paused ? 0 : dtSec * viewer.rate);
  return Math.abs(host.ct - viewerAtHostT) * 1000;
}

export async function pairDrift(host: Page, viewer: Page) {
  const [h, v] = await Promise.all([videoSample(host), videoSample(viewer)]);
  if (!h || !v) throw new Error('video element missing');
  return { host: h, viewer: v, drift: driftMs(h, v), skewMs: Math.abs(h.t - v.t) };
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    n: s.length,
    p50: r(percentile(s, 50)),
    p95: r(percentile(s, 95)),
    max: r(s[s.length - 1] ?? NaN),
    mean: r(s.reduce((a, b) => a + b, 0) / (s.length || 1)),
  };
}

/** Waits until the page's <video> is playing (not paused, time advancing). */
export async function expectPlaying(page: Page, timeout = 15_000) {
  await expect
    .poll(
      async () => {
        const a = await videoSample(page);
        if (!a || a.paused || a.readyState < 2) return false;
        await page.waitForTimeout(300);
        const b = await videoSample(page);
        return !!b && !b.paused && b.ct > a.ct;
      },
      { timeout, message: 'video should be playing' },
    )
    .toBe(true);
}

export async function expectPaused(page: Page, timeout = 10_000) {
  await expect
    .poll(async () => (await videoSample(page))?.paused, {
      timeout,
      message: 'video should be paused',
    })
    .toBe(true);
}
