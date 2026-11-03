// Runs a command with apps/api/.env.test loaded (e.g. to migrate the test database).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(import.meta.dirname, '../.env.test');
if (existsSync(file)) process.loadEnvFile(file);
process.env.NODE_ENV = 'test';
const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
