# Money Heist catalog implementation

## Findings and root cause

Normal `/search` queried only the movie catalog. The separate `/series` TV search used TMDB only when configured; the local development environment has no TMDB key, and the local catalog does not contain Money Heist. Existing watchlists referenced movie records only. The existing `/watch` authentication gate also redirected the new public metadata-only episode page to login.

## Implemented

- Normal search now includes TMDB TV results separately from movie results. Series browse also displays TMDB popular TV when configured. No title is hardcoded or represented as playable by metadata.
- Expanded the TV metadata adapter to expose genres, rating, language, production companies, season posters and episode stills. Series pages display artwork, metadata, season and episode lists, and copyable links. TMDB's season numbering is preserved; its grouping may differ from streaming services.
- Added `GET /api/v1/tv/popular`, `GET /api/v1/tv/:id/seasons/:season/episodes/:episode`, and public `/watch/tv/:id/season/:season/episode/:episode`. Episode navigation covers adjacent episodes and regular season boundaries; specials remain separate. The page explicitly reports that full-episode playback is unavailable and does not create watch history.
- Added a private TV watchlist using `GET /api/v1/saved-tv`, `PUT /api/v1/saved-tv/:id` and `DELETE /api/v1/saved-tv/:id`. A separate additive table is necessary because existing watchlists reference movie UUIDs and must not misrepresent TV series as films. Metadata snapshots are fetched server-side before adding. The user-scoped table cascades on account deletion. It appears in Library → Watchlists.
- The exact metadata-only episode URL is exempt from the optimistic web login redirect; protected playback APIs and existing movie watch routes are unchanged.

## Tests and evidence

- Local and isolated browser databases applied migration `20261101020000_saved_tv_series`.
- Unit tests: full baseline suite passed (shared 19, API 81, web 66); targeted new TV service and provider tests passed (3 tests).
- Series integration: 6 passed, including user-scoped TV watchlist add, deduplication, isolation and removal against Postgres. The upstream series detail was mocked.
- Desktop and mobile browser tests plus existing account journey: 8 passed against a production-built isolated stack. TV metadata, episode metadata and browser watchlist traffic were mocked; the separate integration test exercised real database persistence. These are not live TMDB tests. Browser artifacts follow Playwright configuration.
- Typecheck and lint passed. A formatting warning was corrected; see current command output for latest check.

## Remaining limitations and setup

A TMDB key is required to fetch real metadata. In `apps/api/.env`, set `CATALOG_PROVIDER=auto` and `TMDB_API_KEY` or `TMDB_READ_TOKEN`, restart the API, open `/search`, and search “Money Heist” or “La Casa de Papel”. Open the TV result, choose a season, and select an episode. Sign in to save it under Library → Watchlists. Do not commit credentials. Money Heist is identified by TMDB TV ID 71446; no live search or actual Money Heist metadata was verified without credentials.

The TV watchlist is separate from movie lists. TV browsing history is separate from playback history. TV genre browsing uses TMDB TV genres and currently shows the first result page. No authorized playback source or player session is connected for TMDB episodes, and no source controls, room entry, or captions are advertised. Full-episode playback is not configured. The requested entire live browser acceptance remains blocked by missing provider credentials.

## Phase 1.1 — 2026-11-01

- Configuration check (without exposing values): `CATALOG_PROVIDER=auto`; both `TMDB_API_KEY` and `TMDB_READ_TOKEN` are missing from the local environment and process environment. Live Money Heist search, canonical ID, metadata, artwork and browser acceptance are blocked. The existing mocked TMDB integration verifies auto-selection when a credential is provided; it is not live verification.
- Added separate private account-scoped recently viewed TV page history, recording only validated series/episode metadata. Visiting a page never sets playback progress or completion. Users can remove entries from Library → History. This additive table is necessary because existing playback history references movies only and must not be used to misrepresent metadata visits as watched video. Migration `20261101030000_recent_tv_series` was applied locally and to the isolated browser DB.
- Added TMDB TV genre listing and `/discover/tv` browsing using TV genre IDs, accessible from the series page and matching movie genre collections where the slug exists. Current results show the first page.
- Previous/next navigation now crosses regular seasons, skips missing or empty seasons, and keeps season-zero specials separate. Upstream outages are surfaced rather than silently treated as absent episodes.
- Verification: 13 API integration tests passed across series and mocked TMDB catalog, including auto-selection and account isolation. Five targeted TV service/provider unit tests passed. Desktop and mobile browser runs with mocked provider and recent-list responses passed; exact totals and latest quality checks are recorded below. No live provider request or live Money Heist browser journey succeeded.

### Phase 1.1 final checks

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build` passed.
- API integration: 13 tests passed across `series.int.test.ts` and `catalog-tmdb.int.test.ts`; the TMDB fixture tests run with `CATALOG_PROVIDER=auto` and a test token, with network responses mocked.
- TV service and provider unit tests: 5 passed, including cross-season traversal, empty/missing seasons, specials, upstream failure and TV genre mapping.
- Browser runs: 8 passed for combined account and TV journeys, then 4 passed for the TV-specific suite including genre browsing and mobile rendering. The TV provider and recent-list UI responses were mocked. No claim of live provider verification follows from these tests.
- `FULL EPISODE PLAYBACK`: NOT CONFIGURED. `LIVE MONEY HEIST VERIFICATION`: BLOCKED. Add `TMDB_API_KEY` or `TMDB_READ_TOKEN` to `apps/api/.env` and restart the API; neither is currently configured. Do not commit credentials.

### Live TMDB connection verification

After credentials were configured and the API restarted, `/catalog/info` reported `tmdb`.
Live TV searches for “Money Heist” and “La Casa de Papel” both returned TMDB TV ID 71446.
The live details request succeeded with four TMDB season entries; season 1 returned 15 episodes,
and its first episode metadata endpoint returned HTTP 200. These are API checks, not a complete
browser journey or proof of in-app video playback.

### Season visibility

The first non-special season containing episodes is now selected automatically on a TV series
page. Targeted Playwright TV tests passed (4, with mocked metadata), as did web typecheck and lint.
Money Heist still has no authorized media source connected to its TMDB episode pages.

### Approved episode media connection

TMDB episode pages now check for an administrator-linked local movie/media record and play its
approved, currently licensed sources through the existing signed-media player. Administrators can
link or unlink records in Admin → Series, with explicit confirmation and an audit record. Linking
requires a verified, in-window license and an approved asset; availability is rechecked for each
playback request. Episode metadata alone never supplies media. Migration
`20261101040000_tv_episode_media` was applied to the local and isolated E2E databases.

Targeted series integration: 8 passed, including admin authorization, explicit confirmation,
playback authorization, disabled-asset revocation and audit records. Targeted browser suites:
5 passed, including actual playback of an approved demo video linked to a fictional test episode;
the metadata was mocked and this was not Money Heist. Typecheck, lint, and production builds
used by the browser stack passed. No authorized Money Heist episode has been provided or linked.
TV episode playback does not yet save progress or provide watch-party integration on this route.
