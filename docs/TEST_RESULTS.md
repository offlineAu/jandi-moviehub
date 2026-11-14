# Test Results

## 2026-11-12 — UI/UX audit and hardening

See [UI_UX_AUDIT.md](UI_UX_AUDIT.md) for the full investigation.

- `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` and `corepack pnpm build`
  passed. The lint run now includes `eslint-plugin-jsx-a11y`'s recommended rules, which found 31
  violations; all 31 were fixed at the source and none suppressed. Unit tests: shared 25, API 190,
  web 131.
- `corepack pnpm test:e2e` on the isolated stack: **48 passed, 3 failed** (plus `series-live`, which
  was excluded because it hangs on the concurrently-rewritten series playback). All three failures
  are in the TV/series area, which was being rewritten concurrently — `tv-discovery.spec.ts:4` and
  `tv-discovery.spec.ts:123` expect a season picker and link-based episode navigation that the
  current pages no longer have, and `tv-playback.spec.ts:9` fails on an unguarded
  `series.episodes.filter(...)` in `apps/web/src/components/series/provider-series.ts:66`, which
  is unmodified code. Video-timing tests that failed under load pass in isolation:
  `keyboard-solo` 3/3 and `watch-party` 11/11.
- Two pre-existing bugs were fixed while verifying. The local catalog filtered out demo titles,
  which hid the only playable films and blocked ten browser tests; and the e2e stack inherited the
  developer's `.env`, so the suite ran against a different catalog provider on each machine. The
  stack now pins the movie catalog provider and keeps the TMDB credentials the TV journeys need.
- Axe on `/search` (not covered by the a11y suite) reported three violations before the change —
  heading order on poster cards, a wordmark whose visible text did not match its accessible name,
  and two unlabelled search landmarks — and **zero** after it. The a11y suite itself passes with
  0 serious/critical and 0 moderate/minor on all 12 pages it scans.
- Tap-target counts, Chromium at 390×844: home 39 undersized targets before and 22 after;
  `/browse` 19 → 1 (the off-screen skip link); `/notifications` 5 → 2.
- Frame timing on the home page over 180 frames: 16.67 ms average at a 390×844 viewport, and
  16.67 ms average at 1440×900 with a GPU enabled. Headless Chromium has no GPU, and the same page
  measured 36.4 ms average under SwiftShader software rendering; that figure is a rasteriser
  artefact, not a regression, and no change was made on the basis of it.
- The animated blur-in entrances were measured leaving `filter: blur(0px)` on the element
  permanently. After the change they read `blur(2.5px)` during the animation and `none` after.

## 2026-11-10 — Chat in the full-screen watch-party player

- New Playwright `@mobile` tests "full-screen watch party: read and reply to chat" (portrait and
  landscape) passed on the isolated stack. A desktop host sends a message; the phone viewer in full
  screen sees it float and the unread badge, opens chat, replies, and the reply reaches the host.
  The tests also check that the panel doesn't cover the exit-full-screen control.
- A dev-server run additionally covered a simulated iPhone (no `Element.requestFullscreen`): the
  window-filling fallback was used, chat worked the same, and page scroll was restored on exit.
- Web typecheck, lint and unit tests passed (118/118, incl. new `fullscreen-chat.test.tsx`).
- Not verified on physical devices: real iOS Safari keyboard behaviour in the fallback mode and
  Android keyboard resizing in element full screen.

## 2026-11-10 — Mobile layout pass

- Web typecheck, lint and unit tests passed (114/114, incl. new `mobile-tab-bar.test.tsx`).
- New Playwright `@mobile` test "create-room form stays within the screen after picking a movie"
  passed on the isolated stack. Against the dev server without the fix the same checks fail at
  360 px (page 377 px wide, "Open the room" right edge 377 px, field font 14 px).
- Full `--project=mobile` run: 1 passed, 4 failed — all pre-existing and unrelated to layout:
  three call `movieByTitle`, and `GET /movies?playable=true` no longer lists the seeded demo
  films (Neon Drift etc. are playable per `playability.ts` but absent from the listing with TMDB
  configured); `tv-discovery.spec.ts:123` expects copy ("Full-episode playback is not currently
  available…") that no longer exists in the web app.
- `pnpm lint` fails in `@jandi/api` (`kisskh-stream.service.ts:246` prefer-const) from commit
  455d8c7, not this change.

## 2026-11-01 — Player buffering indicator

- Web typecheck and lint passed. The targeted series browser test passed with real video playback
  and synthetic stalled/waiting events, checking that playback does not retain the spinner and
  that a waiting indicator clears when playback resumes.

## 2026-11-01 — Series playlist integration

- `pnpm typecheck` and `pnpm lint` passed. A fresh targeted Playwright run of
  `series-live.spec.ts` passed: it created the playlist through the series UI and checked both
  episodes, then exercised solo episode navigation and two-viewer room playback.
- The integration command completed the full API integration suite: 17 files and 118 tests
  passed, including playlist ordering, privacy, authentication and empty-series rejection.
- This test did not exercise automatic transition between episodes. During isolated stack startup,
  a delayed playback timer from an earlier deleted test room logged a foreign-key error; the
  timer cleanup/deleted-room race needs investigation.

## 2026-11-01 — movie integration plan, first implementation

- API unit suite: 76 tests passed, including fixed-host Commons search and failure handling.
- API unit suite subsequently passed 77 tests, including an S3 upload test that verifies the
  command receives a readable file stream and its size. The S3 client is mocked; no live S3 or
  MinIO upload was tested.
- Targeted `test/series.int.test.ts`: 3 tests passed, including admin-only writes, edits and
  removal without deleting media, episode navigation and license-state changes, country filters,
  candidate deduplication under concurrent requests, audit records and removal.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` passed after these changes.
- Targeted `series.int.test.ts` and `admin.int.test.ts`: 16 passed after the S3 and episode
  changes, covering local admin uploads and series permissions. Lint, typecheck and formatting
  passed again, and `pnpm build` passed after the S3 streaming adjustment.
- A live Commons search for Big Buck Bunny returned results; the administrator page rendered
  those candidates at 390 px without horizontal overflow. Search results are not proof of rights.
- Targeted Playwright run of `series-live.spec.ts` and `series.spec.ts`: 2 passed on a freshly
  built isolated stack. The live test created two test episodes backed by demo media, used the
  player control to move between them, and started a room with two independent browser contexts
  for the second episode. The other test mocks series responses for the unavailable-episode UI.
  This does not test automatic episode transitions in a room. The full browser suite was not rerun.

## 2026-11-01 — series foundation

- `prisma migrate deploy` applied `20261101000000_series` to the local development and isolated
  browser-test databases.
- `vitest run --project integration test/series.int.test.ts` passed, exercising admin access,
  ordered episodes, duplicates, search, audit records and changing media availability.
- The targeted `tests/e2e/series.spec.ts` Playwright test passed against the isolated stack; its
  series API responses are mocked, so it checks the UI rather than an end-to-end database flow.
- The running local series browse and admin pages rendered without horizontal overflow at a
  390 px viewport; the catalog was empty during this manual Chromium check.
- Repository lint, typecheck and production build passed with the series implementation.

Only results actually executed are recorded, with date, command and outcome.
Machine for all runs: Apple M2 (8 cores), 16 GB, macOS (Darwin 25.6), Node 24.21, PostgreSQL 16.15,
Redis 8.10 — all on localhost.

## 2026-10-31 — continuation

- `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and
  `corepack pnpm build` passed. Unit tests: shared 19, API 73, web 66.
- `corepack pnpm test:integration`: 15 files, 112 tests passed against local PostgreSQL and Redis.
- The first Playwright run used pre-existing test servers: 41 passed, one failed because the
  notifications link was distinguished only by color. The link was underlined; a fresh-stack
  run passed all 42 tests on a newly built isolated stack, including the notifications scan.
- The fresh two-browser sync test sampled for 23.6 seconds at roughly 500 ms intervals on
  localhost: p50 8.9 ms, p95 9.0 ms, maximum 11,946.6 ms. The maximum was one sample during
  the two-second settling period immediately after a 12-second seek; outside that period the
  maximum was 9.0 ms. Post-reconnect p95 and maximum were 6.0 ms (8 samples). These figures
  describe this local run, not real-network performance.
- At a 375 px viewport, all ten admin sections had document scroll width 375 px after fixing
  positioned screen-reader labels escaping the scrollable table container. Wide tables retain
  their own horizontal scrolling. This was a manual Chromium check against the dev server.

## 2026-10-31 — foundation and timer recovery follow-up

- After formatting, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build` passed. The API unit suite subsequently passed 74 tests, including a new timer
  startup test.
- The existing 112 API integration tests passed after the timer startup change. The additional
  `timer-startup.int.test.ts` passed against Redis with a job due before worker startup.
- A subsequent full `pnpm test:integration` run passed all 114 tests in 16 files, including both
  new recovery tests.
- `vitest run --project integration test/marathon.int.test.ts`: 7 passed, including an API
  restart during a countdown; the timer became due while stopped and the marathon resumed playing
  after restart. This does not establish recovery after Redis data loss.
- Ruby's YAML parser accepted the Compose and CI files after fixing the Compose volume syntax;
  this does not establish that the container stack builds or runs.
- `pnpm audit --prod --audit-level high` passed; the unrestricted production audit reported two
  moderate findings in ESLint tooling. Details are in SECURITY_REVIEW.md.

## 2026-10-31 — Session 1

### Static checks

| Command                                             | Result                                           |
| --------------------------------------------------- | ------------------------------------------------ |
| `cd apps/api && npx tsc --noEmit -p tsconfig.json`  | pass                                             |
| `cd apps/api && npx eslint src test`                | pass (after enabling decorator-metadata parsing) |
| `pnpm --filter @jandi/web typecheck / lint / build` | pass (frontend wave 1, 15 routes + proxy)        |

### Unit tests

| Package | Command                            | Result                                                                                                                                                                                                                                          |
| ------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared  | `pnpm --filter @jandi/shared test` | 19 passed (sync math, clock estimator, schemas incl. partial-update defaults)                                                                                                                                                                   |
| api     | `pnpm --filter @jandi/api test`    | 63 passed (playback reducer, marathon machine, TMDB provider w/ fixtures, storage keys, range parsing, signer, avatar sniffing …)                                                                                                               |
| web     | `pnpm --filter @jandi/web test`    | 42 passed (wave 1) + 8 `RoomSyncEngine` tests (late join alignment, viewer intents refused + external changes reverted, controller commands versioned, STALE retry, rate nudge vs seek with cooldown, out-of-order broadcasts, heartbeat drift) |

### API integration tests (real Postgres + Redis + Socket.IO clients)

`pnpm --filter @jandi/api test:integration` — **11 files, 92 tests passed**, run twice
consecutively with identical results. Each run uses its own Postgres schema and Redis key prefix.

| File                                            | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth                                            | register/login/logout, HttpOnly+SameSite cookie, hashed tokens, duplicate email/username, enumeration-safe login, **login rate limit → 429**, session expiry, **CSRF origin block**, reset flow (single-use token, sessions revoked), email verification, guests blocked from account routes, password change revokes other sessions, OAuth disabled w/o creds                                                                                                                                                                                                                                                                                                                                                                                      |
| rooms                                           | public discovery + join, **private rooms absent from discovery and 404 by code**, invite-only join, invite max-uses, 256-bit hashed invite tokens, password rooms (argon2id, minimal preview), friends-only rooms, guest admission rules, moderation permission matrix (co-host can't kick host, members can't promote/edit), ban/unban, host transfer, close, auto-transfer on host leave, full rooms                                                                                                                                                                                                                                                                                                                                              |
| sync                                            | unauthenticated + cross-origin sockets rejected, non-members refused, clock ping, **play/pause/seek propagate to viewers**, **viewer commands rejected (FORBIDDEN) with state unchanged**, EVERYONE policy, **STALE commands rejected with current state**, **idempotent replay**, **exactly one of two concurrent commands wins**, late-join reconstruction (±1.5 s window), **reconnect restores state**, **Redis loss → restored from Postgres**, **server-detected movie end** + early end report rejected, heartbeat drift recording + buffering presence, **host disconnect → co-host after grace**, host reconnect within grace keeps role, kicked member evicted from broadcasts, signed sources members-only, room viewing → watch history |
| chat                                            | broadcast + persistence, XSS payload stored/returned as inert text, replies, reaction toggle + invalid emoji, delete permissions, **flood → RATE_LIMITED**, duplicate spam blocked, non-members refused, floating bursts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| marathon                                        | **full run: TRANSITIONING→PLAYING→INTERMISSION→TRANSITIONING→PLAYING→COMPLETED in order**, **triple concurrent MOVIE_ENDED → single advance**, only hosts control, skip/stop/resume from same index, unplayable titles skipped + countdown, **intermission voting reorders next movie**, manual movie change blocked while active                                                                                                                                                                                                                                                                                                                                                                                                                   |
| social                                          | friend request → live socket notification → accept → list → unfriend, crossing requests auto-accept, presence hidden by privacy setting, private rooms masked, targeted invite notification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| catalog, catalog-tmdb, media, library, profiles | (backend agent) local catalog lists/filters/search/detail, TMDB mode via mocked upstream, signed media (Range 206, bad/expired signature 403, traversal 400, unlicensed 403, HLS + captions), library ownership, profile privacy, avatar magic-byte rejection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Defects found and fixed by these tests (not hidden): end-report tolerance too wide for short
media; BullMQ timer re-armed from inside its own job silently dropped (deterministic job ids) →
unique ids; Redis clients closed before the Socket.IO adapter on shutdown; disconnect handler
could reject during shutdown; first sync state treated as a movie change (client); test runs
interfering with each other (now isolated); `.env.test` duplicate pointing tests at real storage
(guard added).

### Performance (tests/performance/run.mjs, isolated stack, 2026-10-31T21:08Z)

All clients and the server on one machine (loopback) — these measure server/processing cost,
**not** internet latency. Command: `E2E_RATE_LIMIT_MULTIPLIER=1000 node scripts/e2e-stack.mjs api`
then `node tests/performance/run.mjs --clients 20 --commands 30`.

| Measurement                                                 | n       | p50      | p95   | p99   | max   |
| ----------------------------------------------------------- | ------- | -------- | ----- | ----- | ----- |
| GET /health/live (c=20, 8 s) — 16,777 req/s, 0 errors       | 134,214 | 1.02 ms  | 2.57  | 5.24  | 18.85 |
| GET /movies?category=popular (c=20) — 1,520 req/s, 0 errors | 12,160  | 12.95 ms | 17.57 | 21.10 | 52.03 |
| GET /movies?q=neon (c=20) — 2,002 req/s, 0 errors           | 16,013  | 9.98 ms  | 13.38 | 16.23 | 25.86 |
| Room join snapshot (socket ack)                             | 20      | 2.54 ms  | 7.96  | 7.96  | 7.96  |
| Playback command ack (host)                                 | 30      | 13.49 ms | 18.00 | 18.47 | 18.47 |
| Command → `playback:sync` received by each of 20 clients    | 600     | 11.39 ms | 13.35 | 13.67 | 13.84 |
| Clock-offset estimate error (true offset 0)                 | 10      | 0 ms     | 0     | 0     | 0     |

Not yet measured: end-to-end `video.currentTime` agreement between real browsers (pending the
multi-browser Playwright test), behaviour over real networks/latency.

## MovieBox adapter and caption player — 2026-11-02

- Adapter unit tests: 8 passed (mocked network), `pnpm --filter @jandi/api exec vitest run --project unit src/catalog/moviebox.controller.test.ts`.
- Web tests: 72 passed (13 files), including native video/caption attachment and resource cleanup. No live provider was called by these tests.
- API and web TypeScript checks passed. Web lint and targeted API lint passed. Changed-code formatting check passed.
- Production build attempted with webpack: blocked by `ENOTFOUND fonts.googleapis.com` for Inter and Space Grotesk.
- Live provider diagnosis: `curl -I --max-time 5 https://movie-box.co` failed DNS resolution. Spanish audio, full episode playback, subtitle timing, and CDN permission/CORS behavior are not live-verified.

# Railway / Resend preparation — 2026-11-03

- API unit suite: 30 files, 128 tests passed, including seven Resend transport/configuration tests.
- API production build and typecheck passed; targeted ESLint and Prettier checks passed.
- Three Railway configuration files parse as JSON. Docker/container execution, Railway
  deployment and actual Resend inbox delivery have not been verified. Railway sign-in is pending.

## Series watch parties — 2026-11-04

- `pnpm lint`, `pnpm typecheck`: pass (4/4 tasks).
- `pnpm test`: shared 19, API unit 128 (30 files), web 77 (15 files) passed, incl. new
  `episode-bar.test.tsx` (3: controller emits `MOVIE_CHANGE` with next episode; non-controller
  sees "Up next"; controls hidden during marathon).
- `pnpm test:integration`: 126 passed, 3 failed. New series tests pass (start-at-episode playlist,
  linked-TV navigation incl. TMDB-down title fallback, availability `movieId`). The 3 failures are
  pre-existing — `catalog.int.test.ts` (2) and `catalog-tmdb.int.test.ts` (1) fail identically
  with these changes stashed (catalog count/filter expectations: expected total 14, got 10).
- `pnpm --filter @jandi/web build`: compiled successfully.
- Not run: Playwright multi-browser series party.

## 2026-11-05 — Emailer

- `pnpm --filter @jandi/api typecheck` / `@jandi/web typecheck`: pass. ESLint on changed files: pass.
- API unit: 160 passed (33 files), incl. `mail.service.test.ts` (12: no retry on 403, retry on
  429/500, gives up after 3 attempts, logs contain no address, resend.dev warning, template
  escaping).
- `test/auth.int.test.ts`: 14 passed, incl. new outage test (register 201 with
  `verificationEmailSent: false` and a working session; resend → 503; reset request → 202 for
  both existing and unknown emails) and HTML alternative stored by the dev transport.
- Web: `register-form.test.tsx` 3 passed (new: failed-delivery toast).
- Not run: full integration suite, E2E, live Resend delivery (no verified domain).
