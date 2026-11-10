# Experimental KissKH direct synchronization

This is an opt-in integration for the Money Heist KissKH catalog and movie candidates. The KissKH iframe has no documented incoming play, pause or seek commands. This mode instead asks a Stremio-compatible resolver for a direct KissKH HLS or MP4 URL and plays it in Jandi's native room player. The existing KissKH iframe remains available as individual playback. A movie lookup does not confirm browser playback, the correct edition, or availability for every title.

## Configuration

1. Configure an HTTPS Stremio-compatible resolver with KissKH support. For example, a self-hosted [Yastream](https://github.com/hoangtamthai/yastream) instance offers this interface. Using any public third-party service requires its operator's permission and may have rate limits or availability constraints. The resolver receives the selected series and episode identifiers.
2. In the API environment set `KISSKH_STREAM_RESOLVER_URL` to the resolver base URL (no query string or credentials) and `ENABLE_KISSKH_DIRECT_SYNC=true`. Both API processes and any API instances must use the same settings. Restart/redeploy the API.
3. In the web build environment set `KISSKH_MEDIA_ORIGINS` to a comma-separated list of exact HTTPS origins serving the manifest and all video segments, for example `https://cdn.example,https://segments.example`. Restart/redeploy the web app. Never add a signed URL or path to this setting. If the upstream rotates domains, the list must be updated. The provider must also permit browser access (including CORS for HLS.js). No media proxy is included.
4. In the room picker, select Money Heist, then **KissKH · Synced playback (experimental)** and the provider episode. The ordinary KissKH choice continues to use the iframe.

The API fetches `/stream/series/kisskh:<seriesId>:1:<episode>.json` from the configured resolver. It accepts a KissKH-labelled HTTPS `.m3u8` or `.mp4` URL only. The episode is first checked against the existing KissKH catalog. Requests in flight for the same episode are coalesced, but resolved URLs are not put in shared room state or logged. Playback source responses are private and not cacheable by HTTP intermediaries. Every viewer fetches media directly; the API does not proxy media bytes.

For movies, the picker checks the selected title on demand using `/stream/movie/tmdb:<id>.json`. The TMDB ID comes from the server's movie record, and each viewer obtains a fresh URL through the room's authenticated playback-sources endpoint. A missing candidate is shown as unavailable; upstream failures remain retryable. The host should check that the actual movie and edition match before watching together.

## Device test and limits

- Compare the episode content and duration with the known working iframe before testing sync. The resolver uses provider series ID and episode number; its own numbering or cache may differ.
- Open the same room on a desktop host and on Android Chrome/Samsung Internet and iOS Chrome. Each viewer may have to tap to start playback.
- Test play, pause, seek, late join, buffering and reconnect. Compare timestamps after each action; seek correction is handled by the existing native room sync engine.
- Test for at least 30 minutes and record startup time and buffering. A room sync success does not establish that the provider will support larger concurrent audiences.
- This experiment does not currently provide KissKH subtitle tracks, refresh expiring media URLs during playback, or guarantee that the resolver URL is playable in a web browser. Yastream marks its KissKH streams as not web-ready. Resolve CORS, required headers, URL expiry, bitrate and codec issues before considering a broader rollout.
- If the direct source fails, choose **KissKH · Individual playback** again. Disabling the API flag blocks direct sources and their playback commands, and removes the picker option for newly loaded clients.

The separate VidSrc implementation in this working tree has its own deployment settings and database migration; see [EMBED_SYNC.md](./EMBED_SYNC.md). This KissKH experiment adds no migration of its own.

## Render configuration in this repository

`render.yaml` now defines `jandi-moviehub-kisskh-resolver` as a free Singapore web service using the upstream `tamthai/yastream:latest` image. It uses port 55913, checks `/manifest.json`, and passes its assigned HTTPS URL to the API as `KISSKH_STREAM_RESOLVER_URL`. This configuration is only applied if this repository's Blueprint is connected and synced in Render. It has not been deployed or validated against Render in this workspace.

For an existing Blueprint, add a TMDB **read access token** as `TMDB_API_KEY` in the resolver service's Render Environment page; Render does not prompt for new `sync: false` values on an existing Blueprint. Keep it out of Git. After the resolver is deployed, check a known provider series and episode from your own terminal:

```sh
node scripts/check-kisskh-resolver.mjs https://YOUR-RESOLVER.onrender.com 2510 3
```

The script prints only the stream origin, never the full signed URL. If it finds a candidate, add the printed HTTPS origin to `KISSKH_MEDIA_ORIGINS` on Vercel. HLS segments or redirects may use other origins, which must be identified from the browser's network errors and added separately. Then set `ENABLE_KISSKH_DIRECT_SYNC=true` in the API's Render Environment page and redeploy both affected services. These steps enable an experimental source; they do not prove a browser can play it.

Render free web services can spin down after 15 minutes of inactivity and may take about a minute to wake up. The first request may time out: wait for the resolver's manifest to respond before retrying. Free service hours are shared across the workspace, so running a second service can exhaust the included monthly hours sooner. The free resolver is publicly reachable, its image is maintained independently of Jandi, and `latest` must be redeployed manually to pick up updates. Render's free plan cannot restrict incoming IPs for this web service. Use a separate low-privilege token and monitor usage. See [Render free service limits](https://render.com/docs/free) and [image-backed deployments](https://render.com/docs/deploying-an-image).
