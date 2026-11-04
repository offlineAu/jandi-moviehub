# Free deployment setup

Live as of 2026-11-04: https://jandi-moviehub.vercel.app.

## Current state

- Neon Free organization: `pearl`. Created project `jandi-moviehub`
  (`little-breeze-25131287`), PostgreSQL 16, database `jandi_moviehub`, Singapore region,
  fixed 0.25 CU. Schema migrations passed first on `deploy-free`, then on `main`.
- Verified the application can use Neon's pooled connection. Direct connection is used only
  for migrations. Deployment credentials are in ignored `.data/deployment/neon.json` with
  owner-only file permissions. Existing local development `.env` files were not overwritten.
- `.neon` links this directory to the project and `main` branch and is ignored by Git.
- Vercel project `jandi-moviehub` was created on 2026-11-04 in the user's chosen
  `pearljanoplo-9385` Hobby workspace and linked locally. Project ID:
  `prj_aX7DH03GgB15qPT7FPS5T9dNclIE`. Settings: Next.js, Node 24.x, root `apps/web`,
  shared-package build before frontend build, and frozen-lockfile pnpm install. Production
  deployment `dpl_5zH5bPFqBapd2wnbKRk5TKMGnHpT` is ready and publicly accessible.
- Render API `srv-dbli9o942hec738afj7g` is live at
  `https://jandi-moviehub-api.onrender.com`; Key Value instance
  `red-dbli9du1egvs73fcdhd0` is available. Both are explicitly on Free in Singapore.
  Redis has no public IP allowlist and uses `noeviction`. The original empty Redis instance
  was replaced after a connection credential appeared in CLI diagnostic output.
- Netlify is no longer needed now that the Vercel project exists. No Netlify site was created.
- Resend sending key is configured. Its account email is `janoplo.airljoriz@gmail.com`.
  Resend rejected a test to the user's initially supplied other email (HTTP 403). A test to
  the authorized account address is awaiting confirmation. There is no verified sending domain.

## Backend and Redis

`render.yaml` explicitly uses `plan: free` for the API and Key Value instance. Both use
Singapore. Redis uses `noeviction` for BullMQ and disables public access. No paid disk or
pre-deploy command is configured. `scripts/render-start.sh` applies migrations over
`DATABASE_URL_UNPOOLED` before starting the API with pooled `DATABASE_URL`.

Before deployment, provide the values marked `sync: false` through Render's settings:

| Variable                | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| `DATABASE_URL`          | Pooled connection from ignored deployment credentials     |
| `DATABASE_URL_UNPOOLED` | Direct connection from ignored deployment credentials     |
| `WEB_ORIGINS`           | Exact HTTPS frontend origin                               |
| `PUBLIC_WEB_URL`        | Exact HTTPS frontend origin                               |
| `PUBLIC_API_URL`        | Render backend HTTPS origin                               |
| `RESEND_API_KEY`        | Sending key from Resend; do not commit or paste into chat |

The deployed service has its Redis connection, generated media signing secret, database,
Resend key and existing TMDB credentials configured in Render. A future Blueprint deployment
can supply the Redis connection and signing secret automatically. Keep the sender
`Jandi MovieHub <onboarding@resend.dev>` until a domain is verified. Add TMDB credentials
separately if live catalog metadata is desired. Do not copy the entire local `.env`.

## Frontend

Build the Next.js package at `apps/web`, including source from the monorepo root. Use Node 24
and pnpm 10.34.9. Build shared code first:

```sh
pnpm --filter @jandi/shared build && pnpm --filter @jandi/web build
```

Configure these before building:

```dotenv
API_INTERNAL_URL=https://jandi-moviehub-api.onrender.com
NEXT_PUBLIC_WS_URL=https://jandi-moviehub-api.onrender.com
```

REST requests use the Next.js rewrite and keep the HttpOnly cookie on the frontend's domain.
WebSockets connect directly to Render using a 60-second single-use ticket fetched through
that rewrite. A fresh ticket is issued on each reconnect. Session cookies remain SameSite=Lax.

## Free-tier limits

Render's API sleeps after inactivity and starts slowly on its next request. Free Redis loses
state on restart. Uploaded files are ephemeral and disappear on redeploy/restart. These are
limits of this test deployment; movie files need separate persistent storage before relying
on uploads. Resend without a domain cannot send verification/reset emails to other users.
Do not select paid plans to remove these limits; the current budget is zero.

Live checks passed: public homepage, loaded TMDB catalog (129 movie links in the checked page),
database/Redis readiness through Vercel, browser login, host room creation, guest joining,
two-browser live chat over direct WebSockets, and logout/session invalidation. Temporary test
users and their room were removed. Media playback and signup/reset email delivery have not
been verified live. Screenshots and smoke-test results are in ignored `.data/deployment/`.

## Publishing updates

Commit the intended changes, then run `pnpm deploy:web`. It uploads a clean Git archive of HEAD
using the existing local Vercel project link. `pnpm deploy:web --check` validates source
packaging without requesting a deployment. This avoids uploading local caches, media and env
files; the native CLI's first upload scan traversed a large local Turbo cache.

The Vercel GitHub link could not be established because `pearljanoplo-9385` needs a GitHub
Login Connection in Vercel settings first. The current deployment used the CLI and remains
public. Until that connection is added, do not assume a GitHub push deploys the website.
Render was created from the public repository URL; the successful API deployment was
triggered explicitly with its CLI. To deploy backend changes, use
`render deploys create srv-dbli9o942hec738afj7g --output json --confirm` after pushing.

API compilation needs more memory than the running process: the build command sets a 2 GB
Node heap for the compiler, while the API runtime retains its 384 MB heap limit. This does
not change the Free compute plan.

## Neon agent tooling

Installed the official `neon` overview and `neon-postgres` skills under `.agents/skills/`
(14 files). The overview is byte-identical to the requested source at
`https://neon.com/.well-known/agent-skills/neon/SKILL.md` when fetched.
`.codex/config.toml` adds `[mcp_servers.Neon]` with URL `https://mcp.neon.tech/mcp` using OAuth;
there is no API key in the file. Codex recognizes it as an enabled Streamable HTTP server.
OAuth connection to MCP itself is pending its first use; the CLI is authenticated separately.
Existing global Codex/Claude configuration was unchanged. Installed upstream skills are
excluded from project Prettier formatting to preserve their source content.

## Sources

- [Render free service limits](https://render.com/docs/free)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Neon Free plan](https://neon.com/pricing)
- [Netlify Free limits](https://www.netlify.com/pricing/personal-vs-free/)
