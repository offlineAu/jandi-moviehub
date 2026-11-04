# TV episodes in Watch Together

Money Heist can be found in the movie/series search when creating a room and in
Room options → Change title. Choose a season and episode; it loads paused for
everyone. Supported solo episode pages also link to Watch together with the
episode preselected.

The initial provider integration supports catalog Seasons 2 and 3 through
MovieBox, using the existing mapping to provider Parts 3–5. Season 1 is excluded
from room selection because its original and streaming cuts do not map
one-to-one. Other TV search results are shown as unavailable for room playback.
KissKH's embedded player is not used for synchronized rooms.

## Implementation

- Room title inputs accept existing movie UUIDs or validated MovieBox episode
  references. Unsupported identifiers, seasons and episode bounds are rejected.
- Playback state stores an optional `tv_episode` JSON value separately from movie
  and media-asset foreign keys. Redis-loss recovery restores it from Postgres.
- MovieBox playback and media delivery share one injectable service and token
  registry. Room sources retain the existing unlocked-stream checks and expose
  same-origin byte-range video and WebVTT endpoints. No license record is created.
- The existing host/cohost control policy, command versioning, deduplication,
  clock correction and end timer apply to episodes. Changing titles resets the
  timeline and pauses all participants. Marathon switching restrictions remain.
- Room source access requires membership. Third-party provider availability still
  determines whether an episode can be loaded.

Apply migration `20261104000000_room_tv_episode` before starting the updated API.
It adds one nullable JSONB column. It was applied to the local development DB.

## Verification — 2026-11-04

- API unit tests: 26 passed (MovieBox and playback reducer).
- Socket integration tests: 19 passed, including TV creation, host-only controls,
  seek, episode change and persistence recovery in an isolated test schema.
- Frontend targeted tests: 12 passed (TV picker, episode bar, sync engine).
- Shared tests: 20 passed, including supported episode validation.
- API build, frontend typecheck and targeted lint passed.
- Live browser check: searched Money Heist in Create room, selected S2E1,
  created a public QA room and joined from a second independent browser session.
  Both loaded actual MP4 video with an English caption track; sampled playheads
  were 3.016 and 3.018 seconds (readyState 4). Host pause stopped both players.
  The QA room was closed after the test. Screenshot: `/tmp/jandi-room-tv.png`.

Local API startup required process-level `SMTP_URL=smtp://127.0.0.1:1025` and
`WEB_ORIGINS=http://localhost:3000,http://localhost:3487,http://localhost:3320`
because the existing env lacked SMTP_URL and allowed only port 3000. No env file
was overwritten. The current API process uses these local overrides; preserve
them when restarting, or configure the development environment accordingly.
