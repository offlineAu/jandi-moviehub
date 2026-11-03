# Railway deployment

Prepared on 2026-11-03. Cloud deployment and live Resend delivery are pending account sign-in
and credentials. Docker is unavailable locally, so the new container configurations have not
been built or run here.

## Services

Use repository root as the source directory for all application services. Create services named
`api`, `web`, and `gateway`, plus PostgreSQL and Redis. Keep API and web private; generate a
Railway public domain on gateway, targeting port 8080. A custom domain is optional.

Set each application's config file path in Railway's service settings:

| Service | Config file                            | Port |
| ------- | -------------------------------------- | ---- |
| api     | `/infrastructure/railway/api.json`     | 4000 |
| web     | `/infrastructure/railway/web.json`     | 3000 |
| gateway | `/infrastructure/railway/gateway.json` | 8080 |

The gateway routes `/api/` and `/socket.io/` to the API, and everything else to Next.js.
It preserves the HTTPS scheme sent by Railway's edge, including WebSocket upgrade headers.
API migrations run before API deployment with `prisma migrate deploy`; no seed/demo accounts
are created automatically. The API image retains development tools for migrations and admin
bootstrap. Its volume runs under the image's default root user; hardening the image and volume
ownership can follow once the first deployment is verified.

## Variables

Set secrets directly in Railway Variables. Do not paste API keys into chat or commit `.env`.
Replace `https://YOUR-GATEWAY.up.railway.app` with the actual gateway address.

API:

```dotenv
NODE_ENV=production
PORT=4000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
WEB_ORIGINS=https://YOUR-GATEWAY.up.railway.app
PUBLIC_WEB_URL=https://YOUR-GATEWAY.up.railway.app
PUBLIC_API_URL=https://YOUR-GATEWAY.up.railway.app
COOKIE_SECURE=true
TRUST_PROXY=true
ENABLE_DEV_ROUTES=false
MEDIA_SIGNING_SECRET=GENERATE_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
MAIL_TRANSPORT=resend
RESEND_API_KEY=SET_IN_RAILWAY
MAIL_FROM=Jandi MovieHub <onboarding@resend.dev>
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/data/storage
```

The database service names in the references must match the actual project. Generate the media
secret using `openssl rand -base64 48`. Attach a persistent volume to the API at `/data` before
accepting uploads. Redis also needs persistence for playback state and BullMQ timers; use a
Redis deployment with AOF enabled and a volume. PostgreSQL must have a persistent volume too.

Web (these values are needed during the Docker build):

```dotenv
PORT=3000
API_INTERNAL_URL=http://api.railway.internal:4000
NEXT_PUBLIC_WS_URL=https://YOUR-GATEWAY.up.railway.app
```

Gateway:

```dotenv
PORT=8080
API_UPSTREAM=api.railway.internal:4000
WEB_UPSTREAM=web.railway.internal:3000
```

Deploy API and web before gateway so nginx can resolve both upstreams. Redeploy the gateway
if its upstream resolution fails during initial provisioning. Keep one API replica initially.
Add optional TMDB/OAuth/LiveKit credentials only when ready to configure those integrations.

## Email without a domain

Sign up for Resend using your Gmail address and create a sending API key. With
`MAIL_FROM=Jandi MovieHub <onboarding@resend.dev>`, Resend permits test email only to your own
Resend account email. Use that email when testing signup and password reset. Other users'
verification/reset delivery will fail until you verify a domain and change `MAIL_FROM`.
This is a private testing setup, not a public email launch.

Gmail is an account/recipient address here; the application sends via Resend's HTTPS API.
No SMTP credentials or Gmail password are needed. Local development can keep `MAIL_TRANSPORT=dev`.

## Validation before sharing

Check `/api/v1/health/ready` through gateway, register with the Resend account email, follow
the verification link, test password reset, create/join a room from two browsers, and check
WebSocket synchronization. Upload an authorized media file and verify it survives redeployment.
Bootstrap the admin using the API image's `pnpm admin:bootstrap -- --email ... --username ...`
command with an interactive password prompt. Do not copy local `.env` files or local user data.

## References

- [Railway config as code](https://docs.railway.com/config-as-code/reference)
- [Railway outbound SMTP restrictions](https://docs.railway.com/networking/outbound-networking)
- [Resend email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend test-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
