#!/usr/bin/env node
// Generates the original "Jandi Originals" demonstration clips with ffmpeg-static.
//
//   node scripts/generate-demo-media.mjs [--force]
//
// Output (default <repo>/storage/demo/<slug>/, override with DEMO_MEDIA_DIR=<absolute dir>):
//   video.webm        640x360 24 fps VP9 + Opus, burned-in title and running timecode
//   captions.en.vtt   WebVTT captions
//   hls/index.m3u8    H.264 + AAC HLS rendition (4 s segments) — only for titles with `hls: true`
//
// All media is synthesised from ffmpeg test sources; nothing third-party is downloaded or embedded.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';

const TITLES = [
  {
    slug: 'neon-drift',
    title: 'Neon Drift',
    durationSec: 120,
    // Cycling neon hues over the test pattern.
    video: (d) => `testsrc2=s=640x360:r=24:d=${d},hue=h=t*30:s=2`,
    scenes: [
      '[Opening tone]',
      'Neon grid lights pulse across the city',
      '[Tone rises]',
      'The colours drift into violet',
      'A final burst of magenta',
    ],
  },
  {
    slug: 'the-last-projectionist',
    title: 'The Last Projectionist',
    durationSec: 120,
    hls: true,
    // Sepia, grainy, vignetted — an old projector look.
    video: (d) =>
      `testsrc2=s=640x360:r=24:d=${d},colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=18:allf=t,vignette`,
    scenes: [
      '[Projector hum]',
      'The reel flickers to life in an empty theatre',
      '[Tone rises]',
      'Dust dances in the beam of light',
      'The projectionist threads the final reel',
    ],
  },
  {
    slug: 'paper-moon-courier',
    title: 'Paper Moon Courier',
    durationSec: 60,
    // Conway's game of life in moonlit gold on midnight blue.
    video: (d) =>
      `life=s=640x360:r=24:mold=10:ratio=0.12:death_color=#141033:life_color=#f2d27a,trim=duration=${d}`,
    scenes: [
      '[Opening tone]',
      'Letters scatter like stars over the rooftops',
      '[Tone changes]',
      'The courier reaches the moon',
    ],
  },
  {
    slug: 'twenty-second-sunrise',
    title: 'Twenty Second Sunrise',
    durationSec: 20,
    // A warm moving gradient sunrise.
    video: (d) => `gradients=s=640x360:r=24:c0=#ff5e3a:c1=#ffd23f:c2=#3a1c71:n=3:speed=0.02:d=${d}`,
    scenes: ['[Opening tone]', 'The horizon glows orange', '[Tone rises]', 'Sunrise'],
  },
];

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

const repo = resolve(import.meta.dirname, '..');
const outRoot =
  process.env.DEMO_MEDIA_DIR && isAbsolute(process.env.DEMO_MEDIA_DIR)
    ? process.env.DEMO_MEDIA_DIR
    : join(repo, 'storage', 'demo');
const force = process.argv.includes('--force');

const require = createRequire(import.meta.url);
/** @type {string | null} */
const ffmpeg = require('ffmpeg-static');
if (!ffmpeg || !existsSync(ffmpeg)) {
  console.error('ffmpeg-static binary not found. Run `pnpm install` at the repository root.');
  process.exit(1);
}

const font = FONT_CANDIDATES.find((f) => existsSync(f)) ?? null;
if (!font) {
  console.warn(
    'WARNING: no usable font found; clips will be generated WITHOUT burned-in title/timecode.',
  );
}

/** Escapes a value for use inside a single-quoted filtergraph option. */
const esc = (value) =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '\\%');

function overlayFilter(title) {
  if (!font) return null;
  const f = `fontfile='${esc(font)}'`;
  return [
    `drawbox=x=0:y=0:w=iw:h=56:color=black@0.55:t=fill`,
    `drawtext=${f}:text='${esc(title)}':fontsize=30:fontcolor=white:x=(w-text_w)/2:y=14`,
    `drawtext=${f}:text='%{pts\\:hms}':fontsize=64:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2`,
    `drawtext=${f}:text='JANDI ORIGINAL · DEMO MEDIA':fontsize=16:fontcolor=white@0.85:box=1:boxcolor=black@0.5:boxborderw=6:x=w-text_w-14:y=h-text_h-14`,
  ].join(',');
}

/** Sine tone that steps through four pitches, changing every 5 seconds. */
const audioSource = (d) =>
  `aevalsrc='0.2*sin(2*PI*(220+110*mod(floor(t/5),4))*t)':s=48000:c=mono:d=${d}`;

function run(args) {
  const res = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (res.status !== 0) {
    console.error(`ffmpeg failed (exit ${res.status ?? res.signal}).`);
    process.exit(1);
  }
}

function inputs(t) {
  const vf = [t.video(t.durationSec), overlayFilter(t.title)].filter(Boolean).join(',');
  return ['-f', 'lavfi', '-i', vf, '-f', 'lavfi', '-i', audioSource(t.durationSec)];
}

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
function vttTime(sec) {
  const ms = Math.round((sec % 1) * 1000);
  return `${pad(sec / 3600)}:${pad((sec % 3600) / 60)}:${pad(sec % 60)}.${pad(ms, 3)}`;
}

function captions(t) {
  const n = t.scenes.length;
  const slot = t.durationSec / (n + 1);
  const cues = t.scenes.map((text, i) => {
    const start = i === 0 ? 0.5 : slot * i;
    const end = Math.min(start + 4, slot * (i + 1) - 0.1, t.durationSec);
    return `${i + 1}\n${vttTime(start)} --> ${vttTime(end)}\n${text}`;
  });
  const endStart = Math.max(t.durationSec - 3, slot * n);
  cues.push(
    `${n + 1}\n${vttTime(endStart)} --> ${vttTime(t.durationSec)}\n[End card] ${t.title} — a Jandi Original`,
  );
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

const fmtSize = (bytes) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
const summary = [];
const record = (status, file) =>
  summary.push({ status, file, size: existsSync(file) ? statSync(file).size : 0 });

const started = Date.now();
for (const t of TITLES) {
  const dir = join(outRoot, t.slug);
  mkdirSync(dir, { recursive: true });

  const webm = join(dir, 'video.webm');
  if (force || !existsSync(webm)) {
    console.log(`→ ${t.slug}: rendering video.webm (${t.durationSec}s)…`);
    run([
      ...inputs(t),
      '-t',
      String(t.durationSec),
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '600k',
      '-deadline',
      'realtime',
      '-cpu-used',
      '8',
      '-row-mt',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '48',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      '-ac',
      '2',
      webm,
    ]);
    record('made', webm);
  } else record('skipped', webm);

  const vtt = join(dir, 'captions.en.vtt');
  if (force || !existsSync(vtt)) {
    writeFileSync(vtt, captions(t));
    record('made', vtt);
  } else record('skipped', vtt);

  if (t.hls) {
    const hlsDir = join(dir, 'hls');
    const playlist = join(hlsDir, 'index.m3u8');
    if (force || !existsSync(playlist)) {
      mkdirSync(hlsDir, { recursive: true });
      console.log(`→ ${t.slug}: rendering HLS rendition…`);
      run([
        ...inputs(t),
        '-t',
        String(t.durationSec),
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-profile:v',
        'main',
        '-pix_fmt',
        'yuv420p',
        '-b:v',
        '800k',
        '-g',
        '96',
        '-keyint_min',
        '96',
        '-sc_threshold',
        '0',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-f',
        'hls',
        '-hls_time',
        '4',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        join(hlsDir, 'segment_%03d.ts'),
        playlist,
      ]);
      record('made', playlist);
    } else record('skipped', playlist);
    const segs = readdirSync(hlsDir).filter((f) => f.endsWith('.ts'));
    const total = segs.reduce((s, f) => s + statSync(join(hlsDir, f)).size, 0);
    summary.push({
      status: 'info',
      file: `${hlsDir}/segment_*.ts (${segs.length} segments)`,
      size: total,
    });
  }
}

console.log(`\nDemo media in ${outRoot} (${((Date.now() - started) / 1000).toFixed(1)}s):`);
for (const s of summary)
  console.log(`  ${s.status.padEnd(8)} ${fmtSize(s.size).padStart(10)}  ${s.file}`);
if (!font) console.log('\nNote: generated without text overlays (no font found).');
console.log('\nNext: run `pnpm db:seed` so the originals are registered as playable media assets.');
