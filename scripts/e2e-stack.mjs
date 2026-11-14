#!/usr/bin/env node
// Starts an isolated stack for Playwright: `node scripts/e2e-stack.mjs api|web`.
// API :4400 (DB jandi_moviehub_e2e, Redis db 2, migrated + seeded), web :3400 (prod build in .next-e2e).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const api = resolve(root, 'apps/api');
const web = resolve(root, 'apps/web');
export const E2E = { webPort: 3400, apiPort: 4400 };

/** Runs the long-lived server and forwards termination so no orphan keeps the port. */
function serve(cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
  child.on('exit', (c) => process.exit(c ?? 0));
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const mode = process.argv[2];
if (mode === 'api') {
  const envFile = resolve(api, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const base = new URL(
    process.env.DATABASE_URL ??
      'postgresql://jandi:jandi_dev_password@localhost:5432/jandi_moviehub',
  );
  base.pathname = '/jandi_moviehub_e2e';
  const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379/0');
  redis.pathname = '/2';
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(E2E.apiPort),
    DATABASE_URL: base.toString(),
    REDIS_URL: redis.toString(),
    WEB_ORIGINS: `http://localhost:${E2E.webPort}`,
    PUBLIC_WEB_URL: `http://localhost:${E2E.webPort}`,
    PUBLIC_API_URL: `http://localhost:${E2E.apiPort}`,
    ENABLE_DEV_ROUTES: 'true',
    MAIL_TRANSPORT: 'dev',
    DEV_MAIL_DIR: '../../.data/mail-e2e',
    RATE_LIMIT_MULTIPLIER: process.env.E2E_RATE_LIMIT_MULTIPLIER ?? '50',
    HOST_RECONNECT_GRACE_SEC: '3',
    LOG_LEVEL: 'warn',
    MEDIA_SIGNING_SECRET:
      process.env.MEDIA_SIGNING_SECRET ?? 'e2e-only-media-signing-secret-0123456789abcdef',
    // The e2e suite runs against the seeded local catalog. A developer's .env may hold a real
    // TMDB credential, which would switch the movie catalog to TMDB metadata that has no playable
    // assets and make the suite depend on network access. Pin the movie catalog provider so the
    // run is the same on every machine. The TV provider is separate and stays enabled when
    // credentials are present, because the TV journeys are written against live TMDB metadata.
    CATALOG_PROVIDER: 'local',
    TMDB_API_KEY: process.env.TMDB_API_KEY ?? '',
    TMDB_READ_TOKEN: process.env.TMDB_READ_TOKEN ?? '',
  };
  const prisma = resolve(api, 'node_modules/.bin/prisma');
  // Non-destructive: apply migrations and the idempotent seed. Tests create uniquely named data.
  run(prisma, ['migrate', 'deploy'], { cwd: api, env });
  run(resolve(api, 'node_modules/.bin/tsx'), ['prisma/seed.ts'], { cwd: api, env });
  if (process.env.E2E_SKIP_BUILD !== '1' || !existsSync(resolve(api, 'dist/main.js'))) {
    run('pnpm', ['--filter', '@jandi/shared', 'build'], { cwd: root, env });
    run('pnpm', ['--filter', '@jandi/api', 'build'], { cwd: root, env });
  }
  serve('node', ['dist/main.js'], { cwd: api, env });
} else if (mode === 'web') {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    API_INTERNAL_URL: `http://localhost:${E2E.apiPort}`,
    NEXT_PUBLIC_WS_URL: `http://localhost:${E2E.apiPort}`,
    NEXT_DIST_DIR: '.next-e2e',
    WEB_PORT: String(E2E.webPort),
  };
  if (process.env.E2E_SKIP_BUILD !== '1' || !existsSync(resolve(web, '.next-e2e'))) {
    run('pnpm', ['--filter', '@jandi/shared', 'build'], { cwd: root, env });
    run(resolve(web, 'node_modules/.bin/next'), ['build'], { cwd: web, env });
  }
  serve(resolve(web, 'node_modules/.bin/next'), ['start', '--port', String(E2E.webPort)], {
    cwd: web,
    env,
  });
} else {
  console.error('usage: node scripts/e2e-stack.mjs api|web');
  process.exit(1);
}
