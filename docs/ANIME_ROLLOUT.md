# Anime rollout

Anime defaults to `ENABLE_ANIME=false`. An enabled catalog entry is not a guarantee that an episode will play. The new tables, imports, browser player and room controls need reviewed episode mappings and configured adapters before users can watch anything.

## Current evidence

On 2026-11-11, a loopback-origin headless desktop Chromium probe resolved Naruto episode 1 (`kisskh:1263:1:1`) through a Yastream-compatible KissKH adapter. It started, paused, sought to 60 seconds and resumed. The stream used `hls10.cdnvideo11.shop` and also requested `hls10.newvideostream6.site`. This is one episode from one source family; it is not evidence of English subtitles, independent fallback, production CSP compatibility, mobile compatibility, or capacity for 100 viewers.

On 2026-11-12 the same desktop probe passed through the project's Render resolver. The additive migration and Anime Offline Database release `2026-27` were imported into the local development database, together with the single reviewed pilot mapping in `apps/api/anime-mappings/naruto-pilot.json`. The local API returned a ready stream for that mapping. Local configuration enables only this pilot; it does not imply other catalog titles are playable.

The verifier can be run after `pnpm --filter @jandi/api build` with `node scripts/verify-anime.mjs adapter.json PROVIDER_EPISODE_ID`. It prints hostnames and player results, not signed stream URLs. Adapter JSON contains `id`, `family`, `baseUrl`, an exact `mediaHosts` array, and `enabled`. Only include hosts independently reviewed for that adapter. Production browser media origins must also be permitted by the web application's CSP.

## Prepare a test environment

1. Apply the Prisma migration to an isolated database. Import a pinned Anime Offline Database release with `pnpm --filter @jandi/api exec tsx scripts/import-anime.ts RELEASE.json RELEASE_REVISION`. The release is licensed ODbL-1.0; retain the source, revision, attribution and applicable license obligations when distributing the catalog.
2. Import reviewed episode mappings with `pnpm --filter @jandi/api exec tsx scripts/import-anime-mappings.ts MAPPINGS.json`. The import requires a stable catalog key, exact provider episode identifier, stream name, edition, and review evidence. It refuses enabled unverified mappings. Metadata imports never infer playback mappings.
3. Configure `ANIME_ADAPTERS_JSON` and `ENABLE_ANIME=true` only in the test API environment, then configure the web CSP for the verified media origins. Do not add broad wildcard media permissions. A resolver must serve browser-compatible HTTPS HLS or MP4 without required proxy headers.
4. Test solo and rooms with real iOS Safari/Chrome and Android browsers, including start, pause, seek, reload, next episode, captions, source failure, and multiple viewers. Verify the exact production origin separately. Record which title, episode, edition, browser and source passed.

## Release gates still open

- Import and review a useful catalog and episode mappings; the migration alone creates no playable titles.
- Verify at least one independent source family and equivalent editions before enabling automatic fallback between them. Two endpoints backed by KissKH are not independent sources.
- Verify English subtitle availability and timing for each edition. No universal subtitle fallback is implemented for anime.
- Complete the planned representative 20-title/60-episode sample, real-device testing, and the 100-client/20-room one-hour capacity test. Current resolver jobs and caches are process-local; they do not establish multi-instance capacity or CDN performance.
- Add anime-specific saved titles and watch history, catalog filters and operational source-health views before calling the full product plan complete.

No production migration, deployment, provider configuration, or feature activation is performed by these instructions.
