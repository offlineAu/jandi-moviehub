#!/usr/bin/env node
// Print only origins and status, never signed stream URLs or response bodies.
const [baseArg, seriesArg, episodeArg] = process.argv.slice(2);
const seriesId = Number(seriesArg);
const episode = Number(episodeArg);
if (!baseArg || !Number.isSafeInteger(seriesId) || seriesId <= 0 || !Number.isSafeInteger(episode) || episode <= 0) {
  console.error('Usage: node scripts/check-kisskh-resolver.mjs https://YOUR-RESOLVER.onrender.com SERIES_ID EPISODE_NUMBER');
  process.exit(2);
}
let base;
try {
  base = new URL(baseArg);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error();
} catch {
  console.error('Resolver must be an HTTPS base URL without credentials, query, or fragment.');
  process.exit(2);
}
try {
  const prefix = base.href.replace(/\/$/, '');
  const manifest = await fetch(`${prefix}/manifest.json`, { signal: AbortSignal.timeout(90000), redirect: 'error' });
  if (!manifest.ok) throw new Error(`Resolver manifest returned HTTP ${manifest.status}`);
  const doc = await manifest.json();
  if (!Array.isArray(doc.resources) || !doc.resources.some((x) => x === 'stream' || x?.name === 'stream')) {
    throw new Error('Resolver manifest does not advertise streams');
  }
  console.log('Resolver manifest: OK');
  const id = encodeURIComponent(`kisskh:${seriesId}:1:${episode}`);
  const response = await fetch(`${prefix}/stream/series/${id}.json`, { signal: AbortSignal.timeout(90000), redirect: 'error' });
  if (!response.ok) throw new Error(`Stream lookup returned HTTP ${response.status}`);
  const payload = await response.json();
  const streams = Array.isArray(payload.streams) ? payload.streams : [];
  const origins = new Set();
  let count = 0;
  for (const stream of streams) {
    if (typeof stream?.name !== 'string' || !/kisskh/i.test(stream.name) || typeof stream.url !== 'string') continue;
    try {
      const url = new URL(stream.url);
      if (url.protocol !== 'https:' || url.username || url.password || !/\.(m3u8|mp4)$/i.test(url.pathname)) continue;
      origins.add(url.origin);
      count++;
    } catch { /* Ignore invalid stream entries. */ }
  }
  if (!count) throw new Error('No compatible KissKH HLS or MP4 URL returned');
  console.log(`Compatible KissKH stream candidates: ${count}`);
  console.log('Manifest/video origins (HLS segments may use additional origins):');
  for (const origin of origins) console.log(origin);
  console.log('The result does not verify browser CORS, episode identity, subtitles, or playback.');
} catch (error) {
  // Network and parsing exception text may contain URLs; display only a sanitized category.
  const message = error instanceof Error && /^(Resolver manifest returned HTTP \d+|Stream lookup returned HTTP \d+|Resolver manifest does not advertise streams|No compatible KissKH HLS or MP4 URL returned)$/.test(error.message)
    ? error.message : 'Resolver request failed or timed out';
  console.error(message);
  process.exitCode = 1;
}
