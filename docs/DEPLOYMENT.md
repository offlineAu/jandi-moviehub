# Deployment

For the current zero-budget setup, see [FREE_DEPLOYMENT.md](FREE_DEPLOYMENT.md) and `render.yaml`.

For Railway and email over HTTPS, see [RAILWAY.md](RAILWAY.md). The Compose instructions below
use SMTP by default; the API also supports `MAIL_TRANSPORT=resend` with `RESEND_API_KEY`.

Nothing is deployed automatically. These artifacts let you reproduce the stack anywhere that
runs containers. **Status:** the Dockerfiles, compose file and nginx config were written but could
not be built on the development machine (Docker not installed — BLOCKERS B-01); CI is configured
to build both images, but a successful CI run has not yet been observed.

## Topology

```
          TLS (load balancer / Caddy / nginx)
                       │  one public origin, e.g. https://watch.example.com
                 nginx (infrastructure/nginx/default.conf)
        ┌──────────────┼───────────────────────────┐
   /  → web:3000   /api/* → api:4000    /socket.io/* → api:4000 (WebSocket upgrade)
                                   │
                 PostgreSQL 16 · Redis 7 · S3-compatible storage (or a volume)
```

A single origin keeps the session cookie first-party and lets the API's `WEB_ORIGINS` contain
just that origin. Scale the API horizontally: Socket.IO uses the Redis adapter, playback state is
in Redis, BullMQ timers run once across instances. Use sticky sessions only if you enable HTTP
long-polling fallback across instances (WebSocket-only clients don't need them).

## Required configuration (API)

See `apps/api/.env.example` for every variable. Production must set:

| Variable                                               | Notes                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                  | enables production guards                                                                     |
| `DATABASE_URL`, `REDIS_URL`                            | managed Postgres 16+, Redis 7+ (enable AOF/persistence — BullMQ timers live there)            |
| `WEB_ORIGINS`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL`      | the public origin                                                                             |
| `COOKIE_SECURE=true`                                   | enforced                                                                                      |
| `MEDIA_SIGNING_SECRET`                                 | ≥ 32 random chars (`openssl rand -base64 48`); rotate = all media URLs invalidated            |
| `TRUST_PROXY=true`                                     | behind a proxy, so rate limits see client IPs                                                 |
| `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `MAIL_FROM` | HTTPS email delivery; alternatively use `smtp` + `SMTP_URL`; dev is refused in production     |
| `STORAGE_DRIVER=s3` + `S3_*`                           | or `local` with a persistent volume                                                           |
| optional                                               | `TMDB_READ_TOKEN`, `OAUTH_*`, `LIVEKIT_*`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ERROR_WEBHOOK_URL` |

Web build args: `API_INTERNAL_URL` (where Next.js proxies `/api/v1`), `NEXT_PUBLIC_WS_URL`
(public origin). Both are baked in at build time.

The Compose application profile forwards S3 and OAuth options from the root `.env`. For S3,
set `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and, as needed,
`S3_ENDPOINT`, `S3_REGION` and `S3_FORCE_PATH_STYLE`. The configured S3 endpoint must also be
reachable by clients receiving presigned URLs. Supply an actual SMTP endpoint and sender for
production; the Compose default points to the local Mailpit development service.

## Steps (compose)

```bash
cp .env.example .env            # set POSTGRES_PASSWORD, MEDIA_SIGNING_SECRET, PUBLIC_URL
docker compose --profile app build
docker compose --profile app up -d      # runs api-migrate (prisma migrate deploy) first
docker compose --profile app exec api node -e "1"   # sanity
# Admin account (interactive password prompt; or ADMIN_PASSWORD env):
docker compose --profile app run --rm api-migrate pnpm --filter @jandi/api admin:bootstrap -- --email you@example.com --username you
```

Demo media for non-production showcases: `pnpm media:generate` on a machine with the repo, copy
`storage/` to the API volume, then run the seed (`pnpm db:seed`).

## Migrations

`prisma migrate deploy` only (never `migrate dev`/`reset` in production). Run it as a one-off job
before rolling out new API containers (`api-migrate` target). Migrations are additive; take a
backup before applying.

## Health checks

- Liveness: `GET /api/v1/health/live` (process up).
- Readiness: `GET /api/v1/health/ready` → 503 unless Postgres and Redis respond (also reports
  which integrations are configured).
- Both images define Docker `HEALTHCHECK`s.

## TLS, proxy, headers

Terminate TLS at the edge; forward `X-Forwarded-For`/`-Proto`; allow WebSocket upgrades on
`/socket.io/`; disable proxy buffering for `/api/` (media Range responses). Enable HSTS at the
edge once TLS is stable.

## Storage

S3-compatible bucket, private; the API returns presigned GET URLs after its own authorization
checks. With `local`, mount a persistent volume at `STORAGE_LOCAL_DIR`. Keep uploads and media on
storage that is backed up.

## Backups

- Postgres: daily `pg_dump -Fc` (or managed PITR); test restores monthly.
- Redis: AOF on; it holds live room state + timers (rebuilt from Postgres if lost — playback state
  is mirrored in `room_playback_states`; pending timers would need a marathon `retry`).
- Object storage: bucket versioning / replication.

## Logging & monitoring

- JSON logs (pino) to stdout with request ids; secrets redacted. Ship to your log stack.
- Traces: set `OTEL_EXPORTER_OTLP_ENDPOINT` (OTLP/HTTP) to enable OpenTelemetry HTTP/Express
  instrumentation.
- Errors: `ERROR_WEBHOOK_URL` receives a JSON summary of every 5xx/unhandled job error.
- Sync quality: `GET /api/v1/admin/sync-stats` (p50/p95 client drift from heartbeats).
- Alert on readiness failures, 5xx rate, Redis memory, BullMQ failed jobs, DB connections.

## CI

`.github/workflows/ci.yml`: install → format check → lint → typecheck → unit → integration
(Postgres + Redis services) → build → audit → Playwright E2E → Docker image builds.
