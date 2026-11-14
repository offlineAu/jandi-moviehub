# Progress Log

## 2026-11-12 — Logo and wordmark redesign

- **The mark** is now three frames of one picture trailing behind each other — the nearest frame
  crisp and solid, the two behind it soft ghosts — instead of three outlined play glyphs stacked
  on top of each other. Same idea (every screen in the room finding the same frame), but the
  silhouette now reads as a single arrow at favicon size, where the old mark turned to mush.
  Chosen over an aperture/iris and a projector-beam mark by rendering every candidate at 96, 64,
  32 and 16 px and on a light tab bar: the trail was the only one that stayed legible at 16 px
  while keeping the story.
- **The wordmark** is now a film-credit lockup: "Jandi" in the brand gradient, a hairline rule,
  then "MOVIEHUB" tracked out in small caps. It replaces a gradient word with a smaller muted
  descriptor set at a different size, which read as two unrelated pieces of type. The name is
  unchanged — `Jandi MovieHub`.
- The visible text and the accessible name are the same string ("Jandi MovieHub"), so axe reports
  no `label-content-name-mismatch` on the header.
- The mark's motion is unchanged in character — the trailing frames slide in from behind and
  settle into line on load, drift apart on hover, and breathe in and out of sync in the loader —
  and now measures as a real translate (−2.5 px and −1.25 px on hover, front frame scaling to
  1.1) rather than reading as nothing.
- `src/app/icon.svg` was redrawn to match, so the favicon and the installed app icon are the new
  mark rather than the old one.

## 2026-11-12 — UI/UX audit and hardening

Full investigation and remediation of the web interface; see [UI_UX_AUDIT.md](UI_UX_AUDIT.md).

- **Accessibility is now gated at lint time.** `eslint-plugin-jsx-a11y` joined the shared ESLint
  config and its recommended rules run with `pnpm lint`. All 31 violations it found were fixed at
  the source — none suppressed — including a combobox whose options were mouse-only, a set of
  focusable tooltip triggers with no role, and a `<label>` wrapped around a Radix checkbox (a
  `<button>`, which a label cannot associate with).
- **The radius scale was inverted.** `globals.css` set `--radius-xl: 20px` but left `2xl` and `3xl`
  at Tailwind's defaults, so `rounded-xl` rendered rounder than `rounded-2xl` — the two most used
  radii in the app. Compiling the stylesheet proved it. The scale is now declared end to end
  (6/10/14/20/24/32) and is monotonic.
- **Surfaces have a shared scale.** Fifteen distinct `bg-white/[0.0X]` values across 47 files became
  five glass tokens (`--glass-1`…`--glass-5`) and matching `bg-glass-*` utilities. All 91 call
  sites were migrated and each replacement was checked against the original alpha; the largest
  drift is 0.021 and 89 of 91 are within 0.01.
- **One loading vocabulary.** `ui/loading.tsx` adds `LoadingBlock`, `LoadingCards` and
  `LoadingLines`, which reserve the space their content will occupy and announce themselves as
  busy. The series, TV-genre, saved-TV and embed views no longer print raw "Loading …" text.
- **Touch targets measured, then fixed.** A Chromium pass at 390×844 found 39 undersized targets
  on the home page and 19 on `/browse`. `touch-action: manipulation` removes the 300 ms tap delay
  (the app had no `touch-action` rule at all) and `.tap-target` / `.tap-row` grow icon controls
  and list links to 44 px on coarse pointers without overlapping neighbours. `/browse` now has one
  undersized target — the off-screen skip link.
- **Motion no longer leaves a filter behind.** An animated `filter` stays on the element once it
  finishes, keeping it off the browser's fast compositing path. The blur-in entrances are now CSS
  animations that drop the filter when they end: measured `blur(2.5px)` during, `none` after.
- **`/search` is clean under axe** (it was not covered by the a11y suite): heading order on poster
  cards, a wordmark whose visible text did not match its accessible name, and two unlabelled
  search landmarks.
- **The wordmark carries the brand gradient.** `text-brand` existed but was unused; "Jandi" is now
  painted with it instead of plain white.
- **Two bugs found while verifying.** The local catalog filtered out demo titles, which hid the
  only playable films and blocked ten browser tests. The e2e stack inherited the developer's
  `.env`, so the browser suite ran against a different catalog on each machine; it now pins the
  movie catalog provider and keeps the TMDB credentials the TV journeys need.
- Agent skills (`motion`, `ui-ux-pro-max`, `impeccable`, `frontend-design`,
  `vercel-react-best-practices`, `motion-foundations`) and the Motion / Motion+ / GetLayers MCP
  servers are installed for the repository so the audit can be repeated.

## 2026-11-10 — Chat in the full-screen watch-party player

- Full screen in a watch party keeps the chat: new messages float over the picture for 7 s and a
  chat button shows the unread count. Opening it shows the full room chat (read, reply, react)
  beside the picture: a right-hand column in landscape, the lower half in portrait. The picture and
  controls shrink to make room, so nothing is covered.
- `VideoPlayer` gained `fullscreenAside`, `onFullscreenChange` and `fullscreenFallback`. The room
  uses `viewport`: where element full screen doesn't exist (iPhone Safari), the player fills the
  window instead of handing the bare `<video>` to the system player, which can't show chat. That
  mode locks page scroll, exits on Escape and follows `visualViewport` so the on-screen keyboard
  doesn't cover the chat box. The solo watch page keeps the native behaviour.
- The chat input id is now unique per `ChatPanel` (a second one mounts inside the player).

## 2026-11-10 — Mobile layout pass

- Swept every main route at 320, 375 and 390 px with scrolling viewport screenshots plus an
  overflow/overlap probe, and drove the create-room → watch-party flow on phone widths.
- Fixed: single-column grids growing past the screen (picking a movie on Start a watch party
  made the page 419 px wide on a 375 px phone; the browser zoomed out). Global
  `:where(.grid) { grid-template-columns: minmax(0, 1fr) }` plus wrapping selected-title rows
  (movie, TV episode, external) in the room pickers. `datetime-local` inputs no longer force a
  minimum width.
- Fixed: fields under 16px on touch devices (iOS zooms in on focus and stays zoomed). All text
  inputs, textareas and selects are 16px under `(hover: none) and (pointer: coarse)`.
- Fixed: the mobile tab bar hides while the user is typing so it can't sit on the keyboard over
  the field. Programmatic `autoFocus` doesn't hide it.
- Fixed: watch-party reaction bar clipped its last emoji at 320 px.
- Desktop (1280 px) screenshots before/after differ only in live content.

## 2026-11-04 — Free production deployment

- Published https://jandi-moviehub.vercel.app in the selected Hobby workspace and deployed
  the API and Redis on Render Free in Singapore. Neon remains on Free; no paid upgrade made.
- Corrected the API compiler's heap limit separately from its runtime limit. Render build,
  startup migrations and readiness pass. Vercel production build and alias assignment pass.
- Live browser checks pass for login, cookie-backed API calls, room creation, guest join,
  cross-domain WebSockets, chat delivery across two browsers and logout. The first chat
  attempt did not reach the guest; the subsequent run passed after allowing connection setup.
  Temporary test users and room were removed. Actual media playback was not tested.
- Resend is configured, but the supplied key belongs to the original account email; the test
  recipient was rejected. Email delivery remains unverified pending the user's choice.
- Added `pnpm deploy:web` to upload a committed source archive instead of local build caches.
  Vercel GitHub auto-deploy needs a GitHub Login Connection in the new account. See
  FREE_DEPLOYMENT.md for resource IDs, verification and remaining free-tier limits.

## 2026-11-04 — Vercel project created

- Verified the user's selected Vercel account (`pearljanoplo-9385`) and its Hobby workspace.
- Created and linked `jandi-moviehub`, configured Next.js with Node 24.x, root `apps/web`,
  shared-package build, and frozen-lockfile pnpm install. CLI created an ignored root
  `.env.local` containing a Vercel OIDC token; deployment secrets remain outside Git.
- No deployment was started: Render API/Redis and Resend credentials are still pending.

## 2026-11-03 — Free hosting and Neon agent setup

- Created a Neon Free project in Singapore; applied migrations on `deploy-free` before `main`,
  saved deployment credentials outside version control, and preserved local development env.
- Installed official Neon overview/Postgres skills and project-level OAuth MCP configuration.
  Existing user-level Codex/Claude configuration was unchanged. See FREE_DEPLOYMENT.md.
- Added a Render Free API/Redis Blueprint and startup migrations using the direct database URL.
- Added single-use, 60-second socket tickets for cross-domain frontend/backend hosting. Five
  integration tests pass, including no-cookie connection, replay, revoked session, guest and
  origin checks. API/web typechecks, targeted lint, 128 API unit tests, 74 web tests, and API
  build pass. Actual hosted browser tests await deployment.
- Vercel rejects project creation due to an existing fair-use block. Render authorization,
  Resend credentials and the frontend replacement are pending. No paid plan was selected.

## 2026-11-03 — Railway preparation and Resend HTTPS email

- Added Resend HTTPS transport with a 15-second timeout, generic delivery errors, and startup
  validation for the API key. Existing local preview and SMTP transports remain supported.
- Prepared Railway API, web, and gateway configurations, API migration pre-deploy command,
  upload exclusions, and a deployment guide. CLI downloaded; account sign-in is pending.
- All 128 API unit tests (including seven mocked email/configuration tests), API build,
  typecheck, targeted lint and formatting checks passed. These tests
  do not send real email. Local Docker verification remains unavailable; cloud deployment and
  email testing require account authorization and a Resend key. Domainless Resend testing is
  limited to the account owner's recipient address.

## 2026-11-01 — TV catalog and episode pages

- Integrated TV metadata into normal search, added episode metadata pages and user-scoped saved TV series. Applied the additive local migration. Browser tests use mocked TMDB metadata; live Money Heist verification remains blocked by missing credentials. See MONEY_HEIST_CATALOG_IMPLEMENTATION.md.

## 2026-11-01 — Player buffering indicator

- Fixed the player showing a persistent spinner when a download stalls but buffered video keeps
  playing. Playback progress and pause/end events also clear stale waiting state. The targeted
  browser regression, web typecheck and lint passed; the local API was restarted after testing.

## 2026-11-01 — Series playlists

- A signed-in user can create a private playlist containing a series in season/episode order
  from its detail page, then select it in a room's existing marathon panel. The playlist is a
  snapshot, limited to 200 episodes; unavailable episodes are skipped by the marathon engine.
- A fresh browser run created the playlist through the UI and played episodes with two viewers;
  automatic transition between series episodes has not yet been tested end to end.
- An isolated browser-test server logged a stale playback timer referring to an already deleted
  test room. Investigate timer cleanup and deleted-room handling; this run still passed.

## 2026-11-01 — Series and drama foundation

- Added series, ordered seasons/episodes, a public browse/detail API and a responsive series UI.
  Administrators can create series and attach existing movie entries as episodes. Episodes use
  the existing verified-license check and player; the new catalog starts empty.
- Applied the additive series migration to the local database. Series integration tests cover
  authorization, ordering, duplicates, audit logging, search and license-state changes; the
  browser presentation test uses mocked series responses. See TEST_RESULTS.md.
- Still needed for the requested KissKH-like experience: a source of authorized drama/episode
  content, fuller series administration, episode discovery and end-to-end watch-party tests.

## 2026-11-01 — Movie integration plan implementation

- Added audited administrator editing/deletion of series and episode removal; the underlying
  movie and media records remain intact. Series can be filtered by country. Solo playback now
  offers previous/next episode links only when the target is currently playable.
- Added administrator-only Wikimedia Commons video search and a paginated saved-candidate queue.
  Saved items are re-fetched from the fixed Commons API, deduplicated and audited; they remain
  unverified and do not create licenses, movie records or playable assets. Admins can remove them.
- Added series language, genre and year filters based on episode metadata, and audited editing of
  episode positions. S3 file uploads now stream from disk instead of buffering the whole file.
  Corrected ignore rules that would have excluded API storage source files from Git.
- Added and applied migration `20261101010000_source_candidates`. A live Commons search and
  mobile browser rendering were checked locally. See TEST_RESULTS.md for automated evidence.
- A real two-browser test now plays one episode, navigates to the next and starts a room with a
  second viewer using isolated test data. It does not test automatic episode transitions in rooms.
- Outstanding: download/import and rights-review workflow, country/territory enforcement, live S3
  verification and uploads above 500 MB, automatic series progression in rooms,
  and authorized content sources. No paid provider or production deployment has been configured.

## Session 1 — 2026-10-31

**Environment:** macOS arm64, Node 24.21, Homebrew PostgreSQL 16 (running), Redis 8.10 started
project-locally (`redis-server --dir .data/redis --daemonize yes`), no Docker, no system ffmpeg
(project-local `ffmpeg-static`), no TMDB/SMTP/S3/OAuth/LiveKit credentials. Port 3000 on this
machine belongs to an unrelated project → web dev servers use `WEB_PORT` (3300/3310/3320 during
the session); the E2E stack uses web :3400 / API :4400.

### Done (with evidence in TEST_RESULTS.md)

- Phase 0–1: monorepo (pnpm/turbo), shared package, NestJS API foundation (env validation, pino
  logging w/ redaction, error format, health/readiness, OpenAPI at `/api/docs`, OTel bootstrap,
  error-reporting adapter), Prisma schema (32 tables) + migration, Redis, BullMQ timer queue,
  Dockerfiles/compose/nginx (unbuilt — B-01), CI workflow, CLAUDE.md, docs.
- Phase 3 auth (sessions, guests, reset, verification, OAuth adapter, roles, rate limits).
- Phase 4–5 catalog/media/library/profiles (backend agent): local labelled catalog + TMDB adapter,
  signed media (Range/HLS/captions), 4 generated "Jandi Originals", library, privacy, avatars.
- Phase 6–7 rooms + server-authoritative sync engine (Lua CAS, idempotency, staleness, end
  detection, host-disconnect grace, presence, drift telemetry) + client `RoomSyncEngine`.
- Phase 9 chat/reactions, Phase 10 playlists + marathon state machine, Phase 11 friends,
  presence, notifications, Phase 12 admin/reports/voice adapter (admin agent); admin settings
  enforced (registration, room size default, chat slow mode).
- Web wave 1 (frontend agent): design system, shell, auth/discovery/detail/library/settings/
  profile/solo-watch pages, accessible player.
- Security: dependency audit fixed (0 known vulns); SECURITY_REVIEW.md written.
- Performance measured (loopback) — TEST_RESULTS.md.

### Follow-up — 2026-10-31

- The prior session stopped after its admin and QA workers hit a usage limit, then the machine
  slept during the attempted continuation. Their saved UI and Playwright files are present.
- Fixed shared test typechecking, excluded generated Next build directories from lint, corrected
  the notifications link accessibility issue, and fixed admin table overflow on mobile.
- Unit, integration, lint, typecheck and build checks passed; browser evidence is recorded in
  TEST_RESULTS.md. Admin mobile widths were checked at 375 px across all ten sections.

### Next recommended tasks

1. Audit feature acceptance criteria and complete FEATURE_MATRIX and FINAL_REPORT.md.
2. Verify admin flows and deployment artifacts, including Docker when available.

### Foundation and recovery follow-up — 2026-10-31

- Formatted the repository to satisfy the existing CI formatting gate. Fixed invalid Compose YAML,
  added the E2E database and isolated test storage to CI setup, excluded alternate Next build
  directories from Docker contexts, and forwarded S3/OAuth/mail options to the API container.
  Playwright now starts its own servers unless reuse is explicitly requested.
- Timer workers now start at application bootstrap, after module handler registration. Unknown
  timer jobs fail rather than being silently acknowledged. A unit test and a real-Redis startup
  test cover the behavior; the existing integration suite also passes. A marathon integration
  test confirms a countdown due during an API shutdown resumes after restart.
- The current production dependency audit reports two moderate tooling findings, documented in
  SECURITY_REVIEW.md. Docker and the hosted CI workflow remain unverified locally.

### Screenshot film provider investigation — 2026-11-01

- Confirmed that configured TMDB credentials supply metadata; no Filmhub or FilmOn provider
  credentials or agreement were established. Filmhub advertises a licensing service for buyers,
  but hosted playback, Philippines rights, pricing and the target film are unconfirmed.
- Prepared a reviewable inquiry and provider integration handoff in `SCREENSHOT_FILM_PLAYBACK.md`.
  No provider integration or commercial film playback was claimed or tested. The next step is a
  provider response with confirmed rights, documentation and appropriate access.

### Third-party discovery experiment — 2026-11-02

- Per the owner's subsequent request, excluded generated demo titles from local discovery and
  recommendations and removed the external-films promotion from browse and search; existing
  database records and saved items were not deleted.
- Added a VidSrc per-title lookup for TMDB movies and a third-party player fallback in solo
  playback. This source is not verified or represented as licensed, and its catalog lookup is not
  a guarantee of usable playback. Existing licensed asset playback remains separate. No bulk
  catalog scraper or watch-party support was implemented.
- The live third-party lookup returned The Dark Knight and its frame loaded, but in automated
  Chromium the nested video remained paused at 0 seconds (readyState 0). The provider refused a
  sandboxed frame and its unsandboxed player loaded additional third-party advertising/tracking
  frames. Playback, rights, geographic coverage and security are not verified. The player is
  therefore labelled as a third-party attempt rather than verified playback.
- Four targeted unit tests, typecheck, lint and production build passed. Existing statements that
  every source is licensed no longer apply to this experimental fallback.

### External player availability follow-up — 2026-11-02

- Investigated a user report that media is unavailable. The Dark Knight's external lookup still
  reports a listing, but it loads a separate upstream player; prior browser playback stayed at
  zero. A listing cannot establish that the underlying media is currently playable. The exact
  movie in the report has not yet been confirmed.
- Added a reload control and a clear availability note below the third-party player. This does
  not repair missing upstream media. Web typecheck and lint passed; actual playback was not
  verified.

### Playback confirmation follow-up — 2026-11-02

- The user identified The Dark Knight as the unavailable title. The existing third-party lookup
  still reports a catalog record, but the upstream video has not been verified to play.
- The watch page now distinguishes a listed source from one that reports playback, accepting
  playback events only from the active iframe and its expected origin. Reload resets the status.
  A unit test covers event validation; web typecheck and lint passed. Provider events are claims
  from that provider, not independent verification of content or distribution rights.
- No working full-film source or actual-video scraper was established. The user's target remains
  unfulfilled; no source is considered verified solely from a listing or a mocked test.

### Third-party series browsing — 2026-11-02

- Added public, rate-limited source search and episode-list endpoints using fixed upstream hosts and
  input validation. The TV series page allows the user to select an external series and episode;
  it does not assume the provider's episode numbering matches TMDB. Provider-owned iframe playback
  uses a separate source and is not connected to room synchronization or watch history.
- Live Money Heist source search returned `Money Heist - Season 1`, with 13 source episodes. In a
  browser, choosing the first source episode on Jandi loaded a 2918.64-second video and muted
  playback advanced to 8.97 seconds. Its complete identity, soundtrack/audio, whole-episode
  playback, distribution rights, geographic reliability and watch-party behavior were not
  verified. The external player loads third-party advertising/tracking frames.
- Two mocked controller tests, typecheck, lint and production build passed. The API was restarted
  to load the new controller. The Dark Knight movie source remains unverified and was not fixed.

### Episode browser and live search — 2026-11-02

- Consolidated the external episode picker into the primary episode section and automatically
  selected only exact series names or explicit season/part variants. The provider's numbering
  remains separate from the collapsed TMDB episode information because the two cuts can differ.
- Added debounced movie and TV suggestions in the desktop navigation and search page. Suggestions
  navigate directly to title details, handle Escape and suppress stale previous movie results.
- Live desktop search returned Money Heist suggestions; a 390px browser test showed the source
  seasons in order, opened episode 1's intended iframe and had no horizontal overflow. These checks
  did not verify full playback. The matching unit test, web typecheck and lint passed.
- Advertisements inside the cross-origin third-party iframe are controlled by the provider. Jandi
  did not block or remove them; cross-origin isolation prevents the parent page from modifying the
  player's document. An earlier sandbox test caused this provider to refuse playback.

### Notes for future sessions

- Prisma blocks `migrate reset` from AI agents without explicit user consent — the E2E stack is
  deliberately non-destructive (deploy + idempotent seed).
- Integration tests isolate themselves (per-run schema + Redis prefix); `.env.test` is loaded with
  override semantics because Prisma auto-loads `.env`.
- Zod 4 `.partial()` keeps defaults — update schemas are built from default-free fields.

### Episode-card playback integration (2026-11-02)

- Restored the TMDB season and episode browser as the primary series episode list. Episode links open the existing watch page, which checks the configured in-app source and can suggest an episode from the existing external catalog.
- External season/part and episode numbers are suggestions only: source cuts can differ from TMDB, so users must explicitly open the external episode. The embedded player is third-party and may contain advertising or tracking.
- No MovieBox integration, automatic source failover, ad blocking, or verified episode identity is implemented by this change. External catalog discovery does not prove that a stream is working or licensed.
- Web typecheck and lint passed; web Vitest suite passed (11 files, 68 tests). Live playback and browser verification were not rerun for this change.
- Production build could not be verified in the restricted environment: Turbopack was denied a local port, and the webpack fallback could not resolve Google Fonts.

### Single TV player (2026-11-02)

- External episode selection now replaces the built-in availability panel in the same player area; changing the source or episode clears the selected external player. The existing warning about differing episode cuts remains.
- Added content-blocker guidance; no ad blocking is claimed. Iframe sandbox restrictions were not applied because live playback, subtitle, and fullscreen compatibility could not be tested in this network-restricted session.
- Web lint and typecheck passed; web Vitest suite passed (12 files, 69 tests), including a single-player/source-switch regression test. Browser and live third-party playback verification remain outstanding.

### Cinematic redesign + motion system (2026-11-02)

- New motion library `apps/web/src/components/motion/`: viewport reveals and staggers, masked word rise (`SplitWords`), scroll parallax and scroll-fade, pointer tilt with glare, magnetic CTAs, pointer spotlight, pausable marquee, WebGL "iris field" shader background (CSS fallback, pauses off-screen), and React `<ViewTransition>` route transitions (`(main)`/`(auth)` `template.tsx`) plus poster→detail morph from the browse grid.
- Applied to: home (rotating 5-title hero billboard with progress queue and pause control, Ken Burns + parallax, staggered rails, shader pitch section with poster marquee), browse grid, movie detail, rooms list/cards, auth screens, top nav (hide-on-scroll, sliding active pill), mobile tab bar, genre chips, chat message arrival, buttons (press + sheen), shimmer skeletons, footer wordmark, route loader.
- Reduced motion (OS or account preference) disables rotation, tilt, magnetism, parallax, shader animation and view-transition animations; content stays visible.
- Verified: web typecheck, lint, Vitest (12 files, 69 tests), `next build` succeeded. Browser check at 1440 and 390 on a local dev server: home, browse, detail, rooms, login rendered; client navigation browse→detail→back without page errors; reduced-motion hero visible with rotation disabled; h1 accessible names unchanged for e2e selectors. Playwright e2e suite was not run.

### Automatic external episode selection (2026-11-02)

- When no built-in episode source is configured, a matching external episode now loads in the main player automatically; the extra open button and Jandi-hosting message are removed. Source selection still warns that episode numbers and cuts may differ.
- Matching is a title/number suggestion, not proof of episode identity or playback. Autoplay depends on the third-party player and browser settings.
- Web lint and typecheck passed; all 69 web tests passed, including automatic loading and source switching. Live browser playback was not verified in this restricted session.

### Provider episode navigation (2026-11-02)

- The external player now exposes the provider's episode list directly. Choosing a provider episode changes the player without navigating through TMDB episode records; changing provider season selects episode 1.
- External source lookup runs concurrently with built-in availability, and playback lookup no longer waits for TMDB episode details. TMDB details and navigation are labeled separately because cuts may differ.
- Web lint, typecheck, and 69 tests passed. Live playback and latency improvements were not measured in this restricted environment.

### Redesign round 2 (2026-11-02)

- New logo: "sync" mark (three play glyphs converging into one on a violet→pink tile) + "Jandi" wordmark; `app/icon.svg` favicon; loader uses the looping mark. Removed the giant footer wordmark and ticket-stub text; footer rebuilt as columns with an animated top edge.
- Hero rotation runs in the background with no visible progress/pause controls (pauses on hover/focus, off under reduced motion); marquee pause button removed. Added pointer parallax + projector-beam sweep on the hero, masked hero fade into the page, scroll progress bar, ambient drifting light, rail slide-in, heading underline draw, animated "See all" arrows.
- Generated demo artwork (`apps/api/src/catalog/artwork.ts`) no longer bakes in the "JANDI DEMO ART" label; demo status is still disclosed by the UI "Demo" badges, the SVG accessible name and the "Demo catalog" footer note. Artwork unit test updated (3 passed); integration test assertion updated but not run. The running API must be rebuilt/restarted to serve the new art.
- Verified: web typecheck, lint, Vitest (69 tests); browser screenshots at 1440/390 with no page errors.

### External player retry (2026-11-02)

- Added a manual player reload control for third-party playback failures. The embedded player's 503 screen is provider-reported; Jandi cannot inspect its cross-origin contents or guarantee a retry succeeds.
- Live provider diagnosis was blocked by DNS/network restrictions. Web lint and typecheck passed, as did 69 web tests including player reload.

### Episode page simplification and source prefetch (2026-11-02)

- Removed the episode metadata panel and repeated attribution from episode, series, and genre content; retained the site-wide catalog credit while TMDB metadata is used.
- Series pages prefetch the matching external catalog and season list using the existing query cache; fixed an initialization race that cleared a cached episode selection on first render. First visits and external player startup still depend on provider latency.
- Web typecheck and lint passed; 70 web tests passed, including cached source initialization. Live timing and playback were not measured in this network-restricted environment.

### Premium search + buttons (2026-11-02)

- `SearchCombobox` (`components/browse/search-combobox.tsx`) replaces title-only suggestions in the top bar and Search page: poster thumbnails, backdrop "Top result" card, match highlighting, Movies/Series groups, trending picks before typing, loading/empty states, ARIA combobox with arrow/Enter/Esc keyboard support, ⌘K / Ctrl K and "/" to focus.
- Search field: gradient rim + glow on focus, spinner while loading, shortcut hint. Buttons: fully round; glossy sliding-gradient primary with sheen, gradient-rim glass secondary/outline, frosted overlay, press feedback. Shared field style updated to match.
- Verified: web typecheck, lint, Vitest (70 tests); browser: ⌘K focus, typing, arrow navigation and Enter-to-open on a running dev server, no page errors.

### External player accessibility controls (2026-11-02)

- Added a full-screen action for the external player with a fallback message. Added guidance for the player's own subtitle and audio controls; audio dubbing and subtitle tracks depend on the provider and are not selectable through its documented embed API.
- Web lint and typecheck passed; 70 tests passed, including a mocked full-screen request. Live subtitles, dubbed tracks, and full-screen behavior were not verified in the restricted environment.

### Series pages + link/button polish (2026-11-02)

- Series detail (`/tv/[id]`): cinematic backdrop hero, poster tilt, rating/genres, "Play S1 E1" or "Continue S·E" (from recent TV visits), save + copy-link actions, season pill tabs, rich episode rows (still, runtime, play overlay, date, synopsis), restyled "Where to watch".
- Episode page (`/watch/tv/...`): back pill, framed player, episode title + previous/next across season boundaries, sticky season episode sidebar with "Now playing", restyled playback-source card with numbered episode chips.
- New shared UI: `BackLink`, `NativeSelect`, `link-fx` animated-underline links (replacing raw underlined links app-wide), `link` button variant.
- TMDB attribution moved from the footer/auth pages to Settings → About (TMDB API terms require attribution in the app).
- Verified: typecheck, lint, Vitest; browser screenshots of series and episode pages at 1440/390 with no page errors after a dev-cache restart.

### MovieBox original Spanish + English captions (2026-11-02)

Implemented the API adapter and native player for the explicit Money Heist mapping. Provider free-access policy and individual unlocked MP4 streams are enforced. Captions are requested against the chosen MP4 ID and converted to WebVTT. Live verification remains blocked by provider DNS/network access. See MOVIEBOX_INTEGRATION.md for behavior and local checks.

### Series watch parties (2026-11-04)

- Series detail: "Watch series together" creates the ordered playlist and opens room setup with it
  as a marathon; each playable episode gets "Watch together" (room on that episode). "Save as
  playlist" keeps the old flow.
- TV episode page: "Watch together" when the episode has admin-linked licensed media
  (availability now returns `movieId`).
- Room: new `EpisodeBar` under the player shows the show and S·E; controllers get Previous/Next
  episode (Next highlighted when the episode ends), switching the title for everyone via
  `MOVIE_CHANGE`. Hidden during an active marathon.
- API: `series-navigation` reports `kind`/`current` and falls back to linked TMDB episodes;
  `from-series` accepts `?fromMovieId=`. `useChangeRoomMovie` hook extracted from
  `ChangeMovieDialog`.
- Not covered: third-party (KissKH/MovieBox) episodes — see ADR-12. No browser/E2E run of a
  multi-user series party yet.

## 2026-11-05 — Emailer: sign-up no longer fails on mail delivery

- Root cause of "could not send email" on sign-up while login works: the user row was committed,
  then the verification email threw 503 (production sender `onboarding@resend.dev` only reaches
  the Resend account owner). See ADR-13.
- `MailService` rewritten around resend/smtp/dev transports with retries, sanitized logs, a
  startup warning for the resend.dev sender, and `send` (throws) vs `trySend` (boolean).
- New `mail/templates.ts`: branded HTML + text for verification and password reset.
- Register returns `verificationEmailSent`; the web toast says when the email failed and points
  to "Resend email". Password reset always returns 202 even when delivery fails.
- Still needed (external): verify a sending domain in Resend and set `MAIL_FROM` (B-03).

## 2026-11-15 — Home page: movies no longer sit in skeleton state

- Investigation (Playwright + curl): skeletons/empty poster tiles lasted ~1.2s and posters kept
  loading until ~3.8s on cold caches. Causes: every TMDB image went through the Next image
  optimizer (250–1200ms per uncached image), all lists were fetched only after hydration
  (~0.5s), and a TMDB cache expiry made the next visitor wait ~0.5s. See ADR-20.
- Web: `lib/tmdb-image.ts` loader serves TMDB artwork straight from TMDB's CDN at the closest
  rendition (capped at w1280); the home route is ISR (`revalidate = 300`, static on the CDN — no
  per-visit Vercel function) and prefetches its six movie lists while regenerating
  (`lib/queries/prefetch-movies.ts`, 5s cap in production, 1.5s in dev) and hydrates them;
  `components/home/home-rails.ts` is the single definition of those lists. `useMovies(null)` lets
  the layout's search box avoid pre-creating the trending cache entry (it blocked hydration of
  the prefetched list). The hero's first slide no longer blurs in.
- API: `TmdbClient` is stale-while-revalidate (fresh `TMDB_CACHE_TTL_SEC`, then served stale up
  to 24h while one background refresh runs) and shares one upstream call between concurrent
  misses. Cache keys moved to `tmdb:v2:`.
- Not done: unreproduced 4.3s first request on a days-old API process (suspected stale sockets
  after sleep).
