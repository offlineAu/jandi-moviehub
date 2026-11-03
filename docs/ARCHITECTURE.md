# Architecture

## System overview

```
 Browser ──HTTP──▶ Next.js (apps/web, :3000) ──rewrite /api/v1/*──▶ NestJS API (apps/api, :4000)
    │                                                                 │   │   │
    └──────────── Socket.IO (ws, cookie auth) ───────────────────────▶│   │   └── BullMQ workers (same process)
                                                                      │   │
                                                PostgreSQL (Prisma) ◀─┘   └─▶ Redis (state, pub/sub, queues, rate limits, cache)
                                                                      │
                                         Storage driver: local FS (signed URLs) │ S3-compatible (presigned URLs)
```

- **Same-host cookies.** REST calls go through the Next.js rewrite so they are same-origin. The
  Socket.IO client connects to the API origin directly; cookies are host-scoped (not port-scoped)
  so the session cookie is sent. In production a reverse proxy routes `/api` and `/socket.io` to the
  API on the same domain (see `docs/DEPLOYMENT.md`).
- **Horizontal scaling.** Socket.IO uses the Redis adapter; live room/playback/marathon state lives
  in Redis with Lua compare-and-set, so any API instance can serve any room. BullMQ ensures a
  marathon transition job runs once.

## Packages

| Package                      | Purpose                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`            | Zod schemas (validated on both sides), socket event names + payload types, pure sync math (`expectedPosition`, `decideCorrection`, `ClockSync`). Built to CommonJS. |
| `packages/typescript-config` | tsconfig presets (base, nestjs, nextjs, library).                                                                                                                   |
| `packages/eslint-config`     | ESLint flat configs (base, next).                                                                                                                                   |
| `apps/api`                   | NestJS 11 REST + Socket.IO + BullMQ.                                                                                                                                |
| `apps/web`                   | Next.js 16 App Router UI (Tailwind 4, shadcn-style components on Radix).                                                                                            |

UI components live in `apps/web/src/components/ui` (single consumer — a separate `packages/ui`
would be an empty abstraction).

## API modules (`apps/api/src`)

`config` (zod-validated env) · `prisma` · `redis` · `logging` (pino, redaction) · `health` ·
`common` (guards, decorators, zod pipe, error filter, rate limiter, CSRF/origin guard) ·
`auth` (sessions, guests, password reset, email verification, OAuth adapter) · `mail` ·
`storage` (local + S3, signed URLs) · `users` (profiles, avatars, privacy) ·
`catalog` (movie providers: TMDB + local, caching, media/licensing, streaming) ·
`library` (favorites, watchlists, history) · `rooms` (CRUD, invites, membership, moderation) ·
`realtime` (Socket.IO gateway, playback engine, presence) · `chat` · `playlists` + `marathon`
(state machine + BullMQ timers) · `social` (friends, presence) · `notifications` · `reports` ·
`admin` (overview, users, catalog, licenses, rooms, reports, analytics, audit, settings) ·
`voice` (LiveKit token adapter).

## Playback synchronization

State (Redis `room:{id}:playback`, mirrored to `room_playback_states` on change):

```
{ version, movieId, mediaAssetId, status: idle|playing|paused|ended,
  positionSec, rate, anchorServerTime, durationSec, updatedBy, lastCommandId }
expected(T) = playing ? positionSec + (T − anchorServerTime)/1000 × rate : positionSec
```

Command path (`playback:play|pause|seek|rate`, `movie:change`):

1. Socket authenticated at handshake (session cookie or guest session).
2. Membership + `controlPolicy` permission check against DB/Redis.
3. Idempotency: `commandId` recorded in Redis (`SET NX`, 10 min TTL); replays are acked with the
   current state and not re-applied.
4. Staleness: `baseVersion` must equal the current version, otherwise `STALE` + current state.
5. Atomic compare-and-set via Lua; version increments; broadcast `playback:sync` to the room.
6. A BullMQ delayed job is (re)scheduled for the expected end time (marathon progression); jobs
   carry the version and are ignored if the state moved on.

Client:

- `ClockSync` pings (`clock:ping`) at join and every 15 s; keeps the low-RTT half of samples.
- Drift loop every 500 ms: `drift = local − expected(serverNow)`.
  `|drift| < 120 ms` → nothing; `< 1 s` → playback-rate nudge (≤ ±8 %); `≥ 1 s` → seek
  (with 2 s cooldown). Paused rooms seek when misaligned.
- Local media events (user pressing play on the `<video>`) are **intents**: they are converted to
  commands and only applied when the server broadcasts the new state. Programmatic changes made by
  the sync engine are flagged so they never echo back as commands (no feedback loops).
- Heartbeats every 5 s report position/drift/buffering; the server keeps rolling drift statistics
  (`sync:stats`) for measurement and shows per-member drift in the room.

## Marathon state machine

`IDLE → READY → COUNTDOWN → PLAYING → INTERMISSION → TRANSITIONING → PLAYING … → COMPLETED`, any →
`ERROR`. Implemented as a pure transition function (`marathon.machine.ts`), persisted in
`room_playlists` with a version. Timers (countdown, intermission, movie end) are BullMQ delayed jobs
keyed by `(roomId, version)`; a job whose version no longer matches is a no-op, which makes
transitions idempotent and prevents clients from advancing the marathon.

## Security model

See `docs/SECURITY_REVIEW.md`. Highlights: argon2id hashing, opaque session tokens (SHA-256 at
rest), HttpOnly/SameSite=Lax cookies, Origin check on state-changing requests, Zod validation on
every input, Prisma parameterized queries, Redis-backed rate limits, HMAC-signed media URLs,
role + room-role guards on server, audit log for privileged actions.
