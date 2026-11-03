#!/usr/bin/env node
// Performance measurements for Jandi MovieHub. Targets the isolated E2E/perf API (raised rate limits):
//   node scripts/e2e-stack.mjs api &   then   pnpm perf  [--base http://localhost:4400] [--clients 20]
// Prints JSON results; copy them into docs/TEST_RESULTS.md with the date and machine.
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import os from 'node:os';

const require = createRequire(resolve(import.meta.dirname, '../../apps/api/package.json'));
const { io } = require('socket.io-client');
const shared = require('@jandi/shared');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4400');
const ORIGIN = arg('origin', 'http://localhost:3400');
const CLIENTS = Number(arg('clients', '20'));
const COMMANDS = Number(arg('commands', '30'));

const pct = (values, p) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length
    ? Math.round(v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))] * 100) / 100
    : null;
};
const summary = (values) => ({
  n: values.length,
  p50: pct(values, 50),
  p95: pct(values, 95),
  p99: pct(values, 99),
  max: pct(values, 100),
});

async function http(path, init = {}, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return { res, body };
}

async function loadTest(path, { concurrency = 20, durationMs = 8000 } = {}) {
  const latencies = [];
  let errors = 0;
  let limited = 0;
  const end = Date.now() + durationMs;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < end) {
        const t0 = performance.now();
        try {
          const r = await fetch(`${BASE}${path}`);
          await r.arrayBuffer();
          if (!r.ok) errors++;
          if (r.status === 429) limited++;
        } catch {
          errors++;
        }
        latencies.push(performance.now() - t0);
      }
    }),
  );
  return {
    path,
    concurrency,
    durationMs,
    requests: latencies.length,
    rps: Math.round(latencies.length / (durationMs / 1000)),
    errors,
    rateLimited: limited,
    latencyMs: summary(latencies),
  };
}

async function register(i) {
  const tag = `${Date.now().toString(36)}${i}`;
  const { res } = await http('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `perf_${tag}@example.test`,
      username: `perf_${tag}`.slice(0, 24),
      displayName: `Perf ${i}`,
      password: 'perf-password-123',
    }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

function connect(cookie) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, {
      transports: ['websocket'],
      extraHeaders: { cookie, origin: ORIGIN },
      reconnection: false,
      forceNew: true,
    });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

async function syncTest() {
  const { body: list } = await http('/api/v1/movies?playable=true&pageSize=1');
  const movie = list.items[0];
  if (!movie)
    throw new Error(
      'No playable movie — run pnpm media:generate && pnpm db:seed against this stack',
    );
  const hostCookie = await register('h');
  const { body } = await http(
    '/api/v1/rooms',
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Perf room',
        visibility: 'PUBLIC',
        movieId: movie.id,
        maxMembers: 100,
      }),
    },
    hostCookie,
  );
  const roomId = body.room.id;
  const memberCookies = [];
  for (let i = 0; i < CLIENTS; i++) {
    const c = await register(i);
    await http(`/api/v1/rooms/${roomId}/join`, { method: 'POST', body: '{}' }, c);
    memberCookies.push(c);
  }
  const host = await connect(hostCookie);
  const joinLatency = [];
  const members = [];
  for (const c of memberCookies) {
    const s = await connect(c);
    const t0 = performance.now();
    const ack = await s.timeout(5000).emitWithAck(shared.SocketEvents.ROOM_JOIN, { roomId });
    joinLatency.push(performance.now() - t0);
    if (!ack.ok) throw new Error(JSON.stringify(ack));
    members.push(s);
  }
  const hostJoin = await host.timeout(5000).emitWithAck(shared.SocketEvents.ROOM_JOIN, { roomId });
  let version = hostJoin.data.playback.version;

  // Clock offset estimation error (client and server share a clock here, so true offset = 0).
  const clockErrors = [];
  for (const s of members.slice(0, 10)) {
    const clock = new shared.ClockSync();
    for (let i = 0; i < 6; i++) {
      const sent = Date.now();
      const r = await s
        .timeout(3000)
        .emitWithAck(shared.SocketEvents.CLOCK_PING, { clientSentAt: sent });
      clock.addSample(sent, r.serverTime, Date.now());
    }
    clockErrors.push(Math.abs(clock.offsetMs));
  }

  const ackLatency = [];
  const fanout = [];
  const kinds = ['play', 'seek', 'pause'];
  for (let i = 0; i < COMMANDS; i++) {
    const kind = kinds[i % kinds.length];
    const event = {
      play: shared.SocketEvents.PLAYBACK_PLAY,
      pause: shared.SocketEvents.PLAYBACK_PAUSE,
      seek: shared.SocketEvents.PLAYBACK_SEEK,
    }[kind];
    const expectVersion = version + 1;
    const received = members.map(
      (s) =>
        new Promise((resolveRecv) => {
          const h = (p) => {
            if (p.state.version >= expectVersion) {
              s.off(shared.SocketEvents.PLAYBACK_SYNC, h);
              resolveRecv(performance.now());
            }
          };
          s.on(shared.SocketEvents.PLAYBACK_SYNC, h);
        }),
    );
    const t0 = performance.now();
    const ack = await host.timeout(5000).emitWithAck(event, {
      roomId,
      commandId: `perf-${Date.now()}-${i}`,
      baseVersion: version,
      ...(kind === 'seek' ? { positionSec: 10 + i } : {}),
    });
    ackLatency.push(performance.now() - t0);
    if (!ack.ok) throw new Error(JSON.stringify(ack));
    version = ack.data.version;
    for (const at of await Promise.all(received)) fanout.push(at - t0);
    await new Promise((r) => setTimeout(r, 300));
  }
  for (const s of [host, ...members]) s.disconnect();
  return {
    clients: CLIENTS,
    commands: COMMANDS,
    roomJoinSnapshotMs: summary(joinLatency),
    commandAckMs: summary(ackLatency),
    commandToBroadcastReceiptMs: summary(fanout),
    clockOffsetEstimateErrorMs: summary(clockErrors),
  };
}

const startedAt = new Date().toISOString();
const results = {
  startedAt,
  machine: `${os.cpus()[0]?.model} ×${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}, node ${process.version}`,
  target: BASE,
  http: [
    await loadTest('/api/v1/health/live'),
    await loadTest('/api/v1/movies?category=popular&pageSize=20'),
    await loadTest('/api/v1/movies?q=neon'),
  ],
  sync: await syncTest(),
};
console.log(JSON.stringify(results, null, 2));
process.exit(0);
