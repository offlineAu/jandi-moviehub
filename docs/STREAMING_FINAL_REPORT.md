# Streaming implementation report

Status: PARTIALLY_VERIFIED. This report records the current implementation, not completion of the requested platform.

## Implemented

Existing approved local/S3 assets supply MP4, WebM or HLS using signed URLs; player, server-authoritative rooms, playlists and administrator license/asset management predate this iteration. Added TMDB TV search, series details, seasons, episodes and cast, plus Watchmode regional viewing destinations. Results are metadata or external destinations, never proof of rights or in-app playback. The Philippines is the availability UI default; users can enter another two-letter region supported by their Watchmode plan. Provider metadata is cached in Redis. Config and endpoint details: `TMDB_API_KEY` or `TMDB_READ_TOKEN`, `CATALOG_PROVIDER=auto` or `tmdb`, and `WATCHMODE_API_KEY` in `apps/api/.env`; never expose these credentials to browsers. Watchmode's developer plan requires attribution and may restrict enabled regions.

## Verification and limitations

Baseline and adapter tests, isolated series integration, mocked browser TV journey, typecheck, lint and production builds are detailed in STREAMING_TEST_RESULTS.md. No live credentials were configured, so no live Money Heist discovery or regional destination was verified. Prior Big Buck Bunny browser playback does not establish the full 20-step acceptance test. Existing watch-party playback was previously tested with two clients on demo media, not with the newly requested full-length acceptance scenario. Source selection, automatic failover, embeds, cloud providers, TV watchlists, and geo enforcement remain incomplete. See STREAMING_PROVIDER_MATRIX.md and STREAMING_BLOCKERS.md. Commercial licensing and partner integrations require actual provider permissions and credentials; no deployment or purchases were made.

MONEY_HEIST_IN_APP_PLAYBACK: BLOCKED — no authorized source or license configured.
MONEY_HEIST_OFFICIAL_VIEWING: BLOCKED — no live Watchmode credentials or verified destination.
FULL_LENGTH_AUTHORIZED_TEST_PLAYBACK: BLOCKED — previous playback exists, but the complete requested acceptance workflow is not verified.

## Local setup

Configure the provider credentials in `apps/api/.env` and restart the API. With Postgres and Redis available, run `corepack pnpm --filter @jandi/api dev` and `WEB_PORT=3320 corepack pnpm --filter @jandi/web dev`; see README.md for database setup and deployment guidance. Search series at `/series`. Availability is subject to the chosen provider's regional coverage, account plan and current data.
