# Architecture Decision Record

Format: **ADR-n — Title** · Context · Decision · Consequences.

### ADR-1 — Pin mature major versions instead of brand-new majors

_Context:_ On 2026-10-31 npm `latest` included TypeScript 7.0 (Go compiler, 4 months old),
NestJS 12 (2 months), Prisma 7 (driver-adapter/ESM client rewrite), Vitest 5, ioredis 6, React 19.3
(1 day old). The directive requires verified compatibility.
_Decision:_ TypeScript 5.9.3, NestJS 11.2.8, Prisma 6.19.3, Vitest 4.1.12, ioredis 5.11.1,
React 19.2.9, motion 12, @hookform/resolvers 5. Next.js 16.4.3, Tailwind 4.3, Zod 4.6, Socket.IO
4.8, BullMQ 5.81 are current. ESLint 9 (typescript-eslint 8 supports TS ≤ 6.0).
_Consequences:_ All packages are within their peers' supported ranges. Upgrading to the new majors is
a follow-up task once ecosystem support (e.g. decorator metadata in TS 7) is confirmed.

### ADR-2 — Zod schemas shared between web and API (instead of class-validator DTOs)

_Decision:_ `@jandi/shared` exports Zod schemas. The API validates with a `ZodValidationPipe` and
publishes OpenAPI bodies via `z.toJSONSchema()`. _Consequence:_ one source of truth for validation.

### ADR-3 — Opaque server-side sessions

_Decision:_ 256-bit random token in an HttpOnly, SameSite=Lax cookie; SHA-256 hash stored in
`sessions`. 30-day absolute expiry for users, 24 h for guests, rolling `last_used_at`. Revocable.
_Consequence:_ no JWT revocation problems; one indexed lookup per request (Redis cache optional).

### ADR-4 — Guests are `users` rows with `is_guest=true`

_Decision:_ uniform FKs for membership/messages; guests have no email/password and short sessions.

### ADR-5 — CSRF: SameSite=Lax + Origin allow-list on unsafe methods

_Decision:_ Non-GET requests must carry an `Origin` (or `Referer`) in `WEB_ORIGINS`; JSON-only
bodies. Socket handshakes check Origin too.

### ADR-6 — Custom accessible player on native `<video>` + hls.js

_Context:_ Directive allows "Video.js or equivalent". The sync engine needs precise control of
`currentTime`/`playbackRate` and must distinguish programmatic vs user events.
_Decision:_ Own React player (ARIA-labelled controls, keyboard shortcuts) using native playback and
hls.js when MSE is required. _Consequence:_ smaller bundle, no wrapper impedance with sync.

### ADR-7 — Demo media is generated, WebM/VP9 primary

_Decision:_ Generate original clips with ffmpeg-static (VP9/Opus WebM progressive + H.264 HLS).
Playwright's Chromium lacks proprietary codecs, so WebM is what tests play.

### ADR-8 — No `packages/ui`

UI components have a single consumer (`apps/web`); kept in `apps/web/src/components/ui`.

### ADR-9 — Local catalog when TMDB key missing

_Decision:_ `CATALOG_PROVIDER=auto` uses TMDB when `TMDB_API_KEY`/`TMDB_READ_TOKEN` is set,
otherwise the local catalog (seeded, labelled "Demo catalog"). TMDB list results are upserted into
`movies` so watchlists/rooms reference stable UUIDs.

### ADR-10 — Start timer consumption after handler registration

_Context:_ A due BullMQ job could be consumed while Nest modules were still initializing, before
its handler was registered. The previous worker treated a missing handler as successful.
_Decision:_ Create the queue during module initialization and start the worker during application
bootstrap, after module initialization. An unrecognized job throws so BullMQ retries and reports
the failure. _Consequence:_ due jobs are retained through startup; failed jobs still require
monitoring and operational attention after retries are exhausted.

### ADR-11 — Cinematic motion layer on `motion` + native view transitions

_Context:_ Redesign inspired by GetLayers-style cinematic sites, without adding dependencies.
_Decision:_ Build all motion on the existing `motion` package, CSS, and React `<ViewTransition>`
(resolved at runtime from the App Router's React canary, fragment fallback elsewhere). One WebGL
fragment shader for the ambient background, rendered at half resolution. Brand violet/pink and
gradients are kept even though the installed `design-taste-frontend` skill's house rules forbid them.
_Consequence:_ no new runtime deps; every effect is gated by `useMotionOff()` / `MotionConfig`.
