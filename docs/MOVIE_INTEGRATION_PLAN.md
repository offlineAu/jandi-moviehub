# Movie and series integration plan

Status: in progress — 2026-11-01

Implemented so far: audited series edits and removal, episode position editing/removal, discovery
filters using episode metadata, previous/next controls for playable episodes, and an admin-only
Wikimedia Commons candidate search and persistent review list. S3 uploads stream from disk.
Series can also be copied in episode order into a private playlist for room marathons.
The review list does not download or publish videos. The remaining items and acceptance criteria
below have not yet been fully completed.

## Goal

Let people discover movies and Asian dramas, clearly see what can be watched in Jandi, and
watch authorized titles in synchronized rooms with minimal interruptions. A broad metadata
catalog and the right to play a particular video are separate. Do not imply that a title is
playable until its actual source and rights are verified.

## Existing foundation

Jandi has a local catalog, an optional TMDB metadata adapter, approved assets and verified
licenses, local and S3-compatible storage, signed playback URLs, a native video player and room
synchronization. Big Buck Bunny was registered locally with its CC BY attribution. The new
series/episode model and admin creation UI are present; the series catalog is empty. See
PROGRESS.md and TEST_RESULTS.md for the current state and evidence.

## Content sources

1. **Licensed files hosted by Jandi:** openly licensed and verified public-domain films, movies
   provided by creators, and future distributor-licensed movies/episodes. The existing player
   and room sync apply. Require provenance, attribution, territory and availability dates.
2. **External official embeds:** explore supported player APIs, starting with videos whose
   owners enable embedding. Treat this as a separate player integration and evaluate each
   provider's terms, regional availability and playback controls. Do not promise watch-party
   synchronization or fewer ads until tested; provider ads and controls must remain intact.
3. **Discovery-only metadata:** use existing local catalog and optionally TMDB for title details,
   posters and trailers. Clearly show when playback is unavailable. TMDB's free developer API is
   non-commercial and requires attribution; commercial use requires separate terms.
4. **Where-to-watch links:** optional external availability provider once its coverage, terms and
   price suit the project. Links take viewers to the provider; they do not grant in-app playback.
5. **Source discovery:** evaluate Internet Archive and Wikimedia Commons APIs for candidate
   public-domain or openly licensed works. Store source and rights information for human review;
   a search result or uploader's label alone is not proof of rights. Check each file and version.

No source selected here grants a blanket right to stream current studio movies. Obtain rights
or an authorized distribution agreement for those titles.

## Delivery phases

### 1. Usable series and playback administration

- Add editing/removal and pagination for series and episodes; preserve existing movie records.
- Make series and episodes discoverable by country, language, genre and release date where data
  exists; show season, episode, subtitles, source and playability without fabricated counts.
- Give admins a clear flow to create titles, upload or register files, record rights and approve
  assets; preserve the existing audit and access controls. Handle large files without buffering
  them all in memory; explicitly test uploads above the current 500 MB limit before changing it.
- Test admin permissions, unlicensed content, accessibility, mobile layout, episode playback,
  history, and room participation using independent users.

Acceptance: an admin can create, edit and publish a series with two authorized episodes, and
viewers can play the correct episode or start a room. Unlicensed or expired media is not playable.

### 2. Source import and rights review

- Build a source adapter and review queue, initially for a small set of verifiably licensed
  works. Import metadata, source URL, creator, license URL and available video formats; retain
  source identifiers for deduplication and refresh.
- Keep candidates unverified until an administrator checks the exact version, territory,
  permission and attribution. Handle missing metadata, removals and expired rights gracefully.
- Import approved files into configured storage or link externally only when source terms and
  delivery behavior permit it. Avoid unrestricted URL fetches: protect against SSRF, enforce
  allowed hosts, timeouts and file-size/content checks.

Acceptance: approved sample imports are playable with visible attribution; ambiguous candidates
stay unavailable; repeated imports do not duplicate records or erase administrator decisions.

### 3. Playback and watch-party reliability

- Verify progressive MP4/WebM and HLS with realistic full-length media, captions, seeking and
  mobile browsers. Add episode next/previous and resume only when the next item is authorized.
- Extend the authoritative room state to support episode transitions; clients send intents and
  never independently advance the shared room. Test reconnect, concurrent transitions, playback
  recovery, access checks and actual drift with multiple browsers.
- Evaluate an embed adapter separately; use provider-supported controls only, and test actual
  behavior under ads, buffering and regional restrictions before advertising synchronized embeds.

Acceptance: two users can watch two approved episodes in sequence and recover from a disconnect;
all unauthorized controls fail and measured sync results are recorded.

### 4. Broad catalog and production delivery

- Use metadata APIs for discovery and merge results by stable external IDs while retaining Jandi's
  own licensing and source records. A missing asset remains explicitly unavailable.
- For licensed titles, implement territory and license-window enforcement on discovery and
  playback; expire or revoke access promptly and document limitations of cached/presigned URLs.
- Add scalable object storage, CDN delivery, encoding/HLS workflows, resumable uploads, backup,
  observability and cost estimates based on actual storage and bandwidth usage. Obtain partner
  agreements and credentials outside the repository; no automatic purchases or deployment.

Acceptance: a licensed catalog can be imported, filtered by region, played with captions and
revoked; production delivery is load-tested and deployment steps are reproducible.

## Priorities and limits

Start with phase 1 and a small verified catalog. Phase 2 expands the library without assuming
rights; phase 3 makes group watching reliable; phase 4 depends on licensed content and actual
hosting capacity. Keep the application itself ad-free for now. Provider-owned embedded players
may show ads; provider policies must be respected. No claim is made that current commercial
films or a KissKH-sized catalog will be available for free.

## Decisions still needed later

- Initial target countries and languages, which determine rights and catalog filters.
- Whether Jandi stays personal/non-commercial or will be monetized, which affects provider terms.
- Hosting budget and expected number of concurrent viewers before selecting infrastructure.
- A specific authorized content partner, if contemporary commercial dramas are desired.
