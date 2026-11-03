# Jandi MovieHub — Master Plan

> "Your Movie Night. Everyone's Invited."

A social movie platform: discover films, stream **authorized** media, and watch together in
server-synchronized watch parties with chat, reactions and marathon playlists.

## Guiding principles

1. **Server is authoritative** for room permissions, playback state and marathon progression.
2. **Metadata ≠ license.** TMDB (or the local catalog) describes movies; only a `media_assets` row
   linked to a verified, in-window `content_licenses` row makes something playable.
3. **No fake functionality.** Unavailable integrations (TMDB, SMTP, S3, OAuth, LiveKit) run through
   real adapters with clearly-labelled local fallbacks, and the UI says which mode is active.
4. **Evidence over claims.** A feature is VERIFIED only with test/runtime evidence recorded in
   `docs/TEST_RESULTS.md`.

## Phases (dependency order)

| Phase | Scope                                                                    | Exit criteria                       |
| ----- | ------------------------------------------------------------------------ | ----------------------------------- |
| 0     | Repo assessment, planning docs, monorepo                                 | Docs exist, workspace installs      |
| 1     | Foundation: Next.js, NestJS, Prisma, Redis, logging, health, OpenAPI, CI | Gate A                              |
| 2     | Midnight Cinema design system + app shell                                | Components render on mobile/desktop |
| 3     | Authentication, sessions, guests, roles, rate limits                     | Gate B                              |
| 4     | Discovery: provider abstraction (TMDB + local), search, details          | Gate C                              |
| 5     | Library: favorites, watchlists, history, profile, privacy                | Integration tests                   |
| 6     | Rooms: visibility, invites, codes, moderation, host transfer             | Gate D                              |
| 7     | Real-time sync engine                                                    | Gate E (measured)                   |
| 8     | Video player integrated with sync                                        | Multi-client E2E                    |
| 9     | Chat + reactions                                                         | Gate G (chat)                       |
| 10    | Marathon engine (server state machine, BullMQ timers)                    | Gate F                              |
| 11    | Social: friends, presence, notifications, group watchlists               | Gate G                              |
| 12    | Administration + audit logging                                           | Gate H                              |
| 13    | Advanced: scheduled parties, LiveKit adapter, browser notifications      | Documented                          |
| —     | Quality: E2E, a11y, perf, security review, deployment artifacts          | Gate I                              |

## Demonstration content strategy

- `scripts/generate-demo-media.mjs` renders **original** short films (test-pattern reels with
  burned-in timecode, generated tone) using a project-local ffmpeg binary. These are owned by the
  project (`DEMO_GENERATED` license) and are what E2E tests play.
- Real public-domain / Creative-Commons titles are listed with factual metadata only; they become
  playable only when an administrator registers a media file + verified license.
- Posters for local titles are generated artwork (SVG), labelled as such.

## Current status

See `docs/PROGRESS.md` (session log) and `docs/FEATURE_MATRIX.md` (per-feature status).
