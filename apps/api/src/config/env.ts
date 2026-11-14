import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: bool(false),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379/0'),
    /** Optional namespace for every app key (used to isolate test runs). */
    REDIS_KEY_PREFIX: optionalString,

    WEB_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
    PUBLIC_API_URL: z.url().default('http://localhost:4000'),

    COOKIE_SECURE: bool(false),
    COOKIE_DOMAIN: optionalString,
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    GUEST_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    MEDIA_SIGNING_SECRET: z.string().min(32, 'MEDIA_SIGNING_SECRET must be at least 32 characters'),
    MEDIA_URL_TTL_SEC: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(6 * 3600),

    CATALOG_PROVIDER: z.enum(['auto', 'tmdb', 'local']).default('auto'),
    TMDB_API_KEY: optionalString,
    TMDB_READ_TOKEN: optionalString,
    WATCHMODE_API_KEY: optionalString,
    TMDB_CACHE_TTL_SEC: z.coerce
      .number()
      .int()
      .min(60)
      .default(6 * 3600),

    MAIL_TRANSPORT: z.enum(['dev', 'smtp', 'resend']).default('dev'),
    SMTP_URL: optionalString,
    RESEND_API_KEY: optionalString,
    MAIL_FROM: z.string().default('Jandi MovieHub <no-reply@jandi.local>'),
    DEV_MAIL_DIR: z.string().default('../../.data/mail'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('../../storage'),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: bool(true),

    OAUTH_GITHUB_CLIENT_ID: optionalString,
    OAUTH_GITHUB_CLIENT_SECRET: optionalString,
    OAUTH_GOOGLE_CLIENT_ID: optionalString,
    OAUTH_GOOGLE_CLIENT_SECRET: optionalString,

    LIVEKIT_URL: optionalString,
    LIVEKIT_API_KEY: optionalString,
    LIVEKIT_API_SECRET: optionalString,

    OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,
    ERROR_WEBHOOK_URL: optionalString,
    ENABLE_DEV_ROUTES: bool(false),
    ENABLE_PLAYBACK_PIPELINE: bool(false),
    ENABLE_ANIME: bool(false),
    ANIME_ADAPTERS_JSON: z.string().default('[]'),
    ENABLE_VIDSRC_ROOM_SYNC: bool(false),
    ENABLE_KISSKH_DIRECT_SYNC: bool(false),
    KISSKH_STREAM_RESOLVER_URL: optionalString,
    KISSKH_STREAM_RESOLVER_FALLBACK_URL: optionalString,
    /** Scales every rate limit (load/E2E environments only; must be 1 in production). */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).max(1000).default(1),
    QUEUE_WORKERS: bool(true),
  })
  .superRefine((env, ctx) => {
    if (env.KISSKH_STREAM_RESOLVER_FALLBACK_URL) {
      try {
        const url = new URL(env.KISSKH_STREAM_RESOLVER_FALLBACK_URL);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
          throw new Error();
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['KISSKH_STREAM_RESOLVER_FALLBACK_URL'],
          message: 'must be an HTTPS resolver base URL',
        });
      }
    }
    if (env.ENABLE_KISSKH_DIRECT_SYNC) {
      try {
        const url = new URL(env.KISSKH_STREAM_RESOLVER_URL ?? '');
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
          throw new Error();
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['KISSKH_STREAM_RESOLVER_URL'],
          message: 'must be an HTTPS resolver base URL when direct sync is enabled',
        });
      }
    }
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE)
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'must be true in production',
        });
      if (env.RATE_LIMIT_MULTIPLIER !== 1)
        ctx.addIssue({
          code: 'custom',
          path: ['RATE_LIMIT_MULTIPLIER'],
          message: 'must be 1 in production',
        });
      if (env.ENABLE_DEV_ROUTES)
        ctx.addIssue({
          code: 'custom',
          path: ['ENABLE_DEV_ROUTES'],
          message: 'must be false in production',
        });
      if (env.MAIL_TRANSPORT === 'dev')
        ctx.addIssue({
          code: 'custom',
          path: ['MAIL_TRANSPORT'],
          message: 'dev mail transport is not allowed in production',
        });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'required when MAIL_TRANSPORT=smtp',
      });
    if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY)
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'required when MAIL_TRANSPORT=resend',
      });
    if (
      env.STORAGE_DRIVER === 's3' &&
      (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'S3 bucket and credentials required when STORAGE_DRIVER=s3',
      });
    if (env.CATALOG_PROVIDER === 'tmdb' && !env.TMDB_API_KEY && !env.TMDB_READ_TOKEN)
      ctx.addIssue({
        code: 'custom',
        path: ['TMDB_API_KEY'],
        message: 'required when CATALOG_PROVIDER=tmdb',
      });
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
