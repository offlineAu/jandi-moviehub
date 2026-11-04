# MovieBox original-audio integration

Status: LIVE PLAYBACK VERIFIED for Money Heist catalog Season 2, Episode 1.

## Behavior

The Money Heist episode watch page offers MovieBox (original Spanish) and the existing KissKH player. The providers appear in a dropdown with KissKH selected by default, including TV ID 71446. Its provider subject ID and detail path are explicitly mapped from the user's captured title metadata; there is no fuzzy title-to-stream matching. Other titles remain on their existing source paths.

Catalog Season 2 maps to provider Parts 3–4; catalog Season 3 maps to Part 5. This mapping is shared with KissKH selection. Season 1 was recut and does not have a one-to-one catalog mapping.

The API endpoint is `GET /api/v1/moviebox/playback?tvId=71446&season=1&episode=1`. It fetches fresh title and play responses, verifies the original Spanish edition, checks the provider's access policy, and selects unlocked H.264 MP4 streams no higher than 480p. Availability is checked using the requested episode’s public playback response; title-level free-episode counts are not interpreted as a Season 1-only restriction. Forbidden titles, limited playback, and locked streams are rejected. A null title policy is not treated as an access denial; the episode response determines availability. Locked DASH streams, authentication cookies, custom access headers, and preview-limit workarounds are not used.

The adapter requests captions with the selected **MP4 stream ID**, not the captured VIP DASH ID. A zero-delay English SRT track is fetched from the fixed caption CDN, bounded to 1 MB, converted to plain-text WebVTT, and attached as the native player's default subtitle track. Missing, unsupported-delay, or failed captions are visibly reported. Native video controls supply seeking, volume, captions, and fullscreen where supported. Reload obtains fresh links. No AI credentials are required.

## Security and boundaries

- Fixed provider endpoints and exact HTTPS media/CDN host allowlists. The media endpoint accepts only opaque tokens registered for validated, unlocked streams; it accepts no caller-supplied URLs.
- Redirects rejected, 12-second request timeout, bounded response bodies, rate limiting, and sanitized errors.
- API responses are `no-store`; signed media links are not committed or persisted. Browser playback receives a same-origin media URL backed by a bounded in-memory registry (512 sources, two-hour expiry). Restarting the API invalidates these links; refreshing playback obtains new ones. Multiple API replicas require sticky routing or a shared registry. Caption blob URLs are revoked on unmount.
- Provider access flags are not proof of distribution rights. No license assertion is created or added to the authorized media catalog.
- No automatic fallback from original Spanish to dubbed audio. Users can explicitly choose KissKH.

## Verification

Mocked provider tests cover free MP4 selection, locked and limited resources, later-season episode lookup, forbidden titles, original-audio verification, media host validation, captions missing, and SRT conversion. Frontend fixtures cover attaching English captions, releasing object URLs, and video errors. These are not live playback evidence.

The implementation environment cannot resolve `movie-box.co`; live provider requests, MP4 caption compatibility, browser media access, and audible Spanish playback remain unverified. The supplied metadata and playback responses informed the contract, not a passing live test.

## Local check

Restart the API and frontend (the CSP media-host list changed). Open `/watch/tv/71446/season/1/episode/1` and select MovieBox · Original Spanish. Confirm Spanish audio and English captions through the native player's captions menu. Check pause, seek, and fullscreen. A provider HTTP/network failure should display a retryable error. Caption failure should say English subtitles unavailable. The API forwards the provider player page referrer required by both its playback API and media CDN. It does not supply VIP credentials or unlock restricted streams.

## Playback error follow-up — 2026-11-02

- Reproduced the build mismatch locally: the existing SWC output at
  `apps/api/dist/src/catalog/catalog.module.js` registered ExternalSeriesController
  but not MovieboxController. The source module already registered both.
- `pnpm --filter @jandi/api exec nest build` succeeded; the new TypeScript output
  at `apps/api/dist/catalog/catalog.module.js` includes MovieboxController.
- The old API process remains running on port 4000. A listener probe from this
  execution environment fails with EPERM, and localhost requests cannot connect.
  It was left running because a replacement cannot be started here.
- Stop the API in its existing terminal (Ctrl+C), then from the repository root run
  `pnpm --filter @jandi/api start` to use the rebuilt `dist/main.js`.
- MovieBox now explains a missing route rather than exposing a raw Cannot GET
  message. KissKH search and episode lookup show the actual API error and offer
  retry controls. No provider restriction was removed.
- Web suite: 74/74 passed, including both search and detail retry recovery tests.
  Web typecheck and targeted ESLint passed. Live playback remains unverified;
  KissKH's upstream failure cannot be diagnosed from the screenshot alone.
- Episode 7 may remain unavailable under the provider's access policy even after
  restart. A registered route does not establish playback entitlement.
- Additional missing-route recovery test: MovieBox targeted suite 3/3 passed;
  its ESLint check passed. These are mocked UI tests, not live-provider tests.

## Outbound connectivity follow-up — 2026-11-02

The user's restarted API now reaches MovieBox's controller but returns 503 after
10.53 seconds; KissKH requests fail after 8 seconds (the configured timeout).
These logs establish an outbound lookup failure, not its precise network cause.
Both controllers previously swallowed the original transport error. They now
preserve safe diagnostic codes for DNS/connect timeout/TLS failures and HTTP
status failures. Logs contain only provider labels and recognized error codes;
no signed URLs, response bodies, tokens, or cookies are logged.

Run `node scripts/check-playback-connectivity.mjs` in the API's terminal/network.
The script checks DNS and the actual metadata/search endpoints without credentials.
In the agent environment both hosts returned ENOTFOUND, which does not establish
the cause on the user's network. Restart the API after the rebuild to enable
new error reporting. No TLS, provider access, or payment checks were disabled.

Validation: 14 targeted mocked API tests passed; Nest build and targeted ESLint
passed. Live playback remains blocked pending actual network diagnostics.

## Season 2 investigation — 2026-11-03

The screenshot’s access error came from a local preflight condition: under a VIP
title policy, every season other than Season 1 was rejected without requesting
the episode stream. Removed that inferred season restriction. The public episode
response now determines whether an unlocked, non-limited stream is available;
existing stream restrictions remain enforced. Added regression coverage for
Season 2 and episodes beyond the title-level free count.

Replaced the provider buttons with the shared accessible native dropdown and
made KissKH the default. A live metadata request failed with ENOTFOUND inside
the sandbox; the approved external retry resolved addresses but timed out on
HTTPS connections. Actual Season 2 media playback remains unverified.

## Live access-error diagnosis — 2026-11-03

Reproduced the screenshot against the running local API. Live provider metadata
returned `isForbid: false` and `accessStrategy: null`. The remaining null-policy
check caused the misleading access-required response; removed it and added a
regression test. Empty playback resources now return `MOVIEBOX_NO_STREAMS`,
separately from provider access restrictions.

Direct public playback requests for provider parts 1, 2, and 3 episode 1 returned
`code: 0`, `limited: false`, `vipLocked: false`, `hasResource: false`, and empty
`streams`, `dash`, and `hls`. Results were also empty without the extra codec
parameters, on the alternate API host, and with the public page referrer. No
working MovieBox media URL was obtained.

Provider metadata lists five parts (13, 9, 8, 8, 10 episodes), whereas the Jandi
screenshot shows a different catalog season layout. Direct season-number mapping
is therefore not established as correct. Do not claim the current adapter plays
the requested catalog episode until source mapping and actual media are verified.

## Working request and media delivery — 2026-11-03

A temporary browser played provider Part 3, Episode 1 at 480p, advancing beyond
seven seconds with a duration of 3059 seconds. Comparing anonymous requests
showed that the full public player page referrer alone changed the playback API
response from zero streams to three streams (360p/480p unlocked, 1080p locked).
No cookies or authorization headers were needed.

The updated local API returns 480p/360p and English WebVTT (33,560 characters).
The previously running API dated from November 2 and was restarted with the fix.
Direct browser media requests then exposed a second issue: the CDN returned HTML
HTTP 429 without its provider referrer; the same byte-range request with the
provider referrer returned HTTP 206 and valid MP4 bytes.

Media now streams through `/api/v1/moviebox/media/:token` with backpressure,
single byte-range forwarding, validated MP4 content type, upstream cancellation
on disconnect, and no upstream redirects or cookies. An opaque random token is
issued only after the existing title, stream lock, resolution and host checks.
This avoids exposing arbitrary URL proxying. Tests cover range/referrer forwarding,
unknown tokens, malformed ranges, cancellation, and HTML rejection.

Live Jandi browser verification on port 3487 passed: KissKH was initially selected;
choosing MovieBox loaded the 480p video, advanced to 3.01 seconds (readyState 4),
and loaded an English text track in showing mode with 535 cues. Seeking to 120
seconds resumed playback beyond 122 seconds, still readyState 4. Duration was
3059.043 seconds. Screenshot: `/tmp/jandi-playback-fixed.png` (local diagnostic
artifact). No media responses were mocked. This confirms video decoding and
subtitle cue loading, not an independent auditory language check.

Validation: 18 API unit tests and 4 frontend tests passed; API build, web
typecheck, and targeted API/web/shared lint passed. The API was left running on
port 4000 with the fixed build; local startup log: `/tmp/jandi-api-playback.log`.

## Catalog Season 1 Episode 14 follow-up — 2026-11-04

The reported production URL requests catalog S1E14 directly. Provider Part 1
lists 13 episodes; catalog Season 1 has 15 episodes in a different cut. An exact
one-to-one mapping has not been verified. Do not infer Part 2 Episode 1 by
subtracting 13; this would silently choose a different cut of the story.

The solo MovieBox UI now requires an explicit Part 1/2 and episode choice for
Season 1. The catalog title remains visible with a source-selection notice.
The API accepts bounded sourcePart/sourceEpisode parameters only for Season 1,
rejects incomplete/out-of-range choices, and rejects automatic S1E14/15 lookup
with MOVIEBOX_SOURCE_SELECTION_REQUIRED (400) before making provider requests.
KissKH likewise requires explicit source selection for this recut season, with
its source controls now above the player so they are visible before playback.
KissKH remains the default provider.

Validation: 23 mocked MovieBox API tests and 8 targeted frontend tests passed;
frontend/API typechecks and targeted lint passed. The production endpoint could
not be fetched from this environment: curl returned DNS resolution failure and
the web tool could not access it. These changes have not been deployed, and no
live Season 1 episode playback or exact catalog S1E14 correspondence is claimed.

## Provider-native navigation — 2026-11-04

The Money Heist series/watch pages now use the provider episode list directly,
including Parts 1 and 2, with provider-qualified watch URLs. The previous local
manual catalog/source picker remains only for legacy component callers. Room
picks now support provider-coordinate references while retaining older catalog
references. See `PROVIDER_EPISODE_NAVIGATION.md` for artwork fallback, URL identity,
compatibility and verification. No new migration is needed.
