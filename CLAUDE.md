# Jandi MovieHub — Engineering Guide

"Your Movie Night. Everyone's Invited." A social movie platform: discover films, stream
**authorized** media, and watch together in server-synchronized watch parties with chat,
reactions and marathon playlists.

## Session start checklist (do this every session)

1. Read this file, then `docs/MASTER_PLAN.md`, `docs/FEATURE_MATRIX.md`, `docs/PROGRESS.md`,
   `docs/BLOCKERS.md`.
2. Inspect the repo (`git status`, recent files) — trust the code over stale notes.
3. Pick the highest-priority dependency-ready item that is not `VERIFIED`; implement, test,
   verify, then update PROGRESS / FEATURE_MATRIX / TEST_RESULTS / DECISIONS / BLOCKERS.

## Architecture (details: `docs/ARCHITECTURE.md`)

| Path                                  | What                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                            | NestJS 11 REST (`/api/v1`) + Socket.IO + BullMQ timers. Prisma 6 / Postgres 16, Redis.                                                                                          |
| `apps/web`                            | Next.js 16 App Router, Tailwind 4, Radix-based components, TanStack Query, Zustand.                                                                                             |
| `packages/shared`                     | Zod schemas, socket event contracts, sync math (`expectedPosition`, `decideCorrection`, `ClockSync`). Built to CJS — rebuild after edits (`pnpm --filter @jandi/shared build`). |
| `packages/{typescript,eslint}-config` | Shared configs.                                                                                                                                                                 |
| `infrastructure/`                     | Dockerfiles, nginx reverse proxy.                                                                                                                                               |
| `tests/e2e`                           | Playwright (multi-browser sync, journeys, axe). `tests/performance` — measurement scripts.                                                                                      |
| `docs/api/*.md`                       | REST + realtime contracts (`ENDPOINTS`, `ROOMS`, `REALTIME`, `ADMIN`). OpenAPI live at `/api/docs`.                                                                             |

Key invariants:

- **Server is authoritative** for permissions, playback state (Redis Lua CAS, versioned,
  idempotent `commandId`s) and marathon progression (pure state machine + BullMQ timers with
  version checks). Clients send intents, never state.
- **Metadata ≠ license.** Playable only if an `APPROVED` media asset has a verified, in-window
  license (`apps/api/src/catalog/playability.ts` — the single definition).
- **No fake functionality.** Missing credentials → real adapter disabled + labelled fallback.

## Commands

```bash
pnpm install                       # Node ≥ 22.12 (repo uses 24), pnpm 10 via corepack
redis-server --daemonize yes       # or: docker compose up -d postgres redis mailpit
cp apps/api/.env.example apps/api/.env      # set MEDIA_SIGNING_SECRET
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @jandi/shared build
pnpm db:deploy && pnpm media:generate && pnpm db:seed
pnpm dev                           # web :3000, api :4000 (OpenAPI: :4000/api/docs)

pnpm lint && pnpm typecheck        # all packages
pnpm test                          # unit (shared, api, web)
pnpm test:integration              # API vs real Postgres+Redis; each run gets its own schema + Redis prefix
pnpm test:e2e                      # Playwright (starts both servers)
pnpm build                         # production builds
pnpm admin:bootstrap -- --email you@example.com --username you   # ADMIN_PASSWORD env or prompt
```

API test env lives in `apps/api/.env.test` (DB `jandi_moviehub_test`, Redis db 1,
`HOST_RECONNECT_GRACE_SEC=1`).

## Conventions

- TypeScript strict; no `any` escapes without reason. Prettier (single quotes, width 100).
- API: validate every input with Zod via `@ValidBody/@ValidQuery` (`common/zod.ts`); errors via
  `Errors.*` (`common/errors.ts`) → `{error: {code, message, details}, requestId}`. Guards are
  global: `@Public()`, `@AllowGuest()`, `@Roles()`, `@RateLimit()`. Wrap single resources
  (`{room}`), lists `{items}`, paginated `{items, page, pageSize, total, totalPages}`.
- Zod 4 gotcha: `.partial()` keeps `.default()`s — define update schemas from default-free fields.
- Privileged actions → `AuditService.record`. Room permissions → `rooms/room-access.ts`.
- Socket handlers validate payloads and re-check membership/permissions on every command.
- Tests: unit `*.test.ts` beside sources; API integration `apps/api/test/*.int.test.ts`
  (`helpers.ts`: `createTestApp`, `registerUser`, `connectSocket`, `emitAck`, `nextEvent`).
- Web: user content is rendered as text (never `dangerouslySetInnerHTML`); respect
  `prefers-reduced-motion`; every icon button has an accessible name.

## Security requirements

argon2id passwords; opaque session tokens (SHA-256 at rest) in HttpOnly SameSite=Lax cookies
(`Secure` in production — enforced by env validation); Origin check on unsafe methods and socket
handshakes; Redis-backed rate limits; HMAC-signed, expiring media URLs; invite tokens 256-bit and
hashed; room passwords argon2id; magic-byte upload validation; secrets only via env (never in
example files or logs — pino redaction). See `docs/SECURITY_REVIEW.md`.

## Persistent progress files

`docs/MASTER_PLAN.md`, `ARCHITECTURE.md`, `FEATURE_MATRIX.md`, `PROGRESS.md`, `DECISIONS.md`,
`BLOCKERS.md`, `TEST_RESULTS.md`, `SECURITY_REVIEW.md`, `DEPLOYMENT.md`, `FINAL_REPORT.md`.
Update them as you work; record only evidence you actually observed.

## Autonomous execution & completion

Work in dependency order; don't ask about routine technical choices; never fabricate
credentials, results or benchmarks; never deploy or touch external infrastructure without
explicit authorization. A feature is `VERIFIED` only with test/runtime evidence. The project is
`FULLY_VERIFIED` only when every gate (A–I) in `docs/FINAL_REPORT.md` passes.
