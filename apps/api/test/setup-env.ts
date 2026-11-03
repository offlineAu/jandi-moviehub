import { loadTestEnv } from './load-test-env';

// DATABASE_URL / REDIS_KEY_PREFIX come from the global setup (per-run isolation).
loadTestEnv(['DATABASE_URL', 'REDIS_KEY_PREFIX']);
