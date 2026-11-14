/** An explicit, short browser probe. Never prints signed URLs, cookies, or response bodies. */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { adapterConfigSchema, resolveStreams } from '../apps/api/dist/anime/source-adapter.js';
async function main() {
  const [file, providerId] = process.argv.slice(2);
  if (!file || !providerId)
    throw new Error('Usage: verify-anime.mjs adapter.json PROVIDER_EPISODE_ID');
  const adapter = adapterConfigSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  const begin = Date.now();
  const sources = await resolveStreams(adapter, 'series', providerId, AbortSignal.timeout(85000));
  const report = {
    adapter: adapter.id,
    family: adapter.family,
    resolverMs: Date.now() - begin,
    candidates: sources.length,
    realMobileTested: false,
  };
  if (!sources.length) {
    console.log(JSON.stringify(report));
    process.exitCode = 1;
    return;
  }
  const source = sources[0];
  report.streamName = source.label;
  report.format = source.format;
  report.origin = new URL(source.url).origin;
  const require = createRequire(resolve(import.meta.dirname, '../apps/web/package.json'));
  const hls = await readFile(require.resolve('hls.js/dist/hls.min.js'));
  const server = createServer((req, res) => {
    if (req.url === '/hls.js') {
      res.setHeader('content-type', 'application/javascript');
      res.end(hls);
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'unsafe-inline'; media-src 'self' blob: ${adapter.mediaHosts.map((h) => `https://${h}`).join(' ')}; connect-src 'self' ${adapter.mediaHosts.map((h) => `https://${h}`).join(' ')}; worker-src blob: 'self'`,
    );
    res.end(
      '<!doctype html><html><body><video id="video" muted playsinline controls></video><script src="/hls.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const failures = [];
    page.on('requestfailed', (req) => {
      try {
        failures.push({ origin: new URL(req.url()).origin });
      } catch {}
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        try {
          failures.push({ origin: new URL(res.url()).origin, status: res.status() });
        } catch {}
      }
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Probe unavailable');
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate(({ url, format }) => {
      const video = document.querySelector('video');
      const win = window;
      if (format === 'HLS' && win.Hls.isSupported()) {
        const hls = new win.Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
      } else video.src = url;
      void video.play().catch(() => {});
    }, source);
    try {
      await page.waitForFunction(
        () => {
          const v = document.querySelector('video');
          return !v.paused && v.currentTime > 2;
        },
        null,
        { timeout: 25000 },
      );
      report.started = true;
      await page.evaluate(() => document.querySelector('video').pause());
      const pausedAt = await page.evaluate(() => document.querySelector('video').currentTime);
      await page.waitForTimeout(1000);
      report.pause = await page.evaluate(
        (t) => Math.abs(document.querySelector('video').currentTime - t) < 0.2,
        pausedAt,
      );
      await page.evaluate(() => {
        document.querySelector('video').currentTime = 60;
      });
      await page.waitForFunction(
        () => {
          const v = document.querySelector('video');
          return !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - 60) < 2;
        },
        null,
        { timeout: 15000 },
      );
      report.seek = true;
      await page.evaluate(() => document.querySelector('video').play());
      await page.waitForFunction(() => document.querySelector('video').currentTime > 62, null, {
        timeout: 15000,
      });
      report.resume = true;
    } catch {
      report.browserFailure = true;
      process.exitCode = 1;
    }
    report.failedRequests = failures.slice(0, 20);
    report.player = await page.evaluate(() => {
      const v = document.querySelector('video');
      return {
        readyState: v.readyState,
        errorCode: v.error?.code ?? null,
        position: v.currentTime,
      };
    });
    report.browser =
      'headless Chromium; loopback origin; not a production-origin or real-device pass';
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    server.close();
  }
}
void main().catch(() => {
  console.error('Anime verification failed (configuration, resolver, or browser unavailable).');
  process.exitCode = 1;
});
