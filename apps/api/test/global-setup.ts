import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadTestEnv } from './load-test-env';

/**
 * Gives every integration run its own Postgres schema and Redis key prefix so concurrent
 * runs (two terminals, parallel agents) never truncate or flush each other's data.
 * Worker processes inherit these env vars because they are spawned after global setup.
 */
export default async function setup() {
  loadTestEnv();
  const runId = `it_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const base = new URL(process.env.DATABASE_URL!);
  base.searchParams.set('schema', runId);
  process.env.DATABASE_URL = base.toString();
  process.env.REDIS_KEY_PREFIX = `${runId}:`;
  process.env.NODE_ENV = 'test';

  execFileSync(resolve(__dirname, '../node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });

  return async () => {
    // Imported lazily: Prisma Client loads apps/api/.env on import, which must not happen before
    // the test env is in place.
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${runId}" CASCADE`);
    await prisma.$disconnect();
  };
}
