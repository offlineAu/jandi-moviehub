# Streaming progress

## 2026-11-01

Baseline: NestJS API, Next.js UI, Postgres/Prisma, Redis/Socket.IO and BullMQ. Movie TMDB adapter is credential-gated and cached; local series and episodes, signed approved assets, video player, rooms, playlists and admin rights tools exist. The local Big Buck Bunny asset previously played in a browser. Region restrictions are not enforced.

Added a separate TV metadata adapter using the existing TMDB client/cache, with search, title details, cast, season and episode details and explicit metadata-only UI. Series search accepts original or translated names. Added a separate Watchmode availability adapter using documented TMDB IDs and the X-API-Key header, with regional search (PH default), Redis cache, timeouts, sanitized https destinations and attribution. Provider absence is surfaced as configuration needed; neither adapter creates playable media. Browser, API integration and unit tests use simulated provider data. Live providers remain unverified without keys.

The full task remains in progress. Provider synchronization, commercial rights, title watchlists for TV metadata, external provider player integration, source selector and automatic failover are not implemented. Existing playback remains limited to approved local or S3 assets.
