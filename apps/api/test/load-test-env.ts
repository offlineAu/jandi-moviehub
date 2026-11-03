import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads apps/api/.env.test OVERRIDING existing variables. Override matters: Prisma Client
 * auto-loads apps/api/.env (dev values) on import, and test values must win over those.
 * Variables listed in `keep` (set by the global setup for run isolation) are preserved.
 */
export function loadTestEnv(keep: string[] = []) {
  const file = resolve(__dirname, '../.env.test');
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (keep.includes(key) && process.env[key]) continue;
    process.env[key] = value;
  }
  process.env.NODE_ENV = 'test';
}
