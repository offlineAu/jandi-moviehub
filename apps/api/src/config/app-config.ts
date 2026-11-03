import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
import { type Env, loadEnv } from './env';

/** Validated, typed application configuration. Fails fast on invalid environment. */
@Injectable()
export class AppConfig {
  readonly env: Env = loadEnv();

  get isProduction() {
    return this.env.NODE_ENV === 'production';
  }

  get isTest() {
    return this.env.NODE_ENV === 'test';
  }

  get devRoutesEnabled() {
    return !this.isProduction && this.env.ENABLE_DEV_ROUTES;
  }

  get storageDir() {
    return resolve(process.cwd(), this.env.STORAGE_LOCAL_DIR);
  }

  get devMailDir() {
    return resolve(process.cwd(), this.env.DEV_MAIL_DIR);
  }

  get tmdbEnabled() {
    if (this.env.CATALOG_PROVIDER === 'local') return false;
    return !!(this.env.TMDB_API_KEY || this.env.TMDB_READ_TOKEN);
  }
}
