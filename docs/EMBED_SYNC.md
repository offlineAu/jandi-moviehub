# Synchronized embed pilot

VidSrc can receive play, pause and absolute seek commands after the viewer activates its player. Its progress events normally arrive about every five seconds. This integration uses those documented controls, not access to the iframe's video DOM. Reference: https://vidsrc.sh/vidsrc/docs/ (Player Events, Player Controls, Content Info).

KissKH remains individual playback. Its documented API at https://kisskh.megaplay.su/ reports events but does not document inbound transport commands. Native media and MovieBox keep their existing synchronization paths. VidSrc TV uses TMDB coordinates; KissKH and MovieBox retain provider-native numbering. Do not translate one provider's episode numbers into another provider's selection.

## Deployment and rollback

1. Test the additive Prisma migration on an isolated database branch/schema. For Neon, use the existing direct connection through `DATABASE_URL_UNPOOLED`, not the pooled application URL. Do not run `db:reset` or modify production data for testing.
2. Deploy migrations through the existing `scripts/render-start.sh` (it selects the direct connection), then deploy the Render API with `ENABLE_VIDSRC_ROOM_SYNC=false`.
3. Deploy the Vercel frontend. It reads `/api/v1/room-sources/capabilities`; there is no separate frontend feature flag. Old clients' UUID/episode references still work. New clients send typed external playback selections.
4. Complete the device gate below. Enable `ENABLE_VIDSRC_ROOM_SYNC=true` on the pilot API only after controls and recovery pass, then redeploy the API. Capabilities refresh on a new page load or after their one-minute cache becomes stale. Existing provider listings are not proof of successful playback.
5. Limit the private pilot to 20 simultaneous viewers, in rooms of at most 10. The creation form defaults to 10; this is a pilot operating limit, not a new global hard cap. Do not expose a public launch based on these measurements.
6. Roll back by setting the API flag to false and redeploying. It blocks new external loads, source responses, and external control commands. Hosts can choose native media or existing individual alternatives. The additive column may remain; do not drop it during rollback.

No new paid services, custom domains, video storage, transcoding, CDN configuration or stream proxy are required. Each device connects directly to the provider. Free infrastructure cold starts, upstream availability, codec support, bandwidth, quality selection and ads remain outside Jandi's control.

## Device gate — required, not yet verified

Run `pnpm dev` and open `/dev/embed-controls` on a development web instance reachable from the test device. The route returns 404 outside development. The test page works without enabling room sync. Use an HTTPS development tunnel if the phone needs one; configure allowed web/API origins consistently. The page logs sent commands separately from accepted provider events, along with session-only startup timing. A sent command is not an acknowledgement.

Test desktop Chrome, Android Chrome, Samsung Internet and iPhone Safari. For each, test one movie and a specific TV episode. Include the Money Heist episode that previously failed and a different series. Verify the episode's actual content matches its selected coordinates.

- Initial frame loading; tap provider play before sending commands.
- Play, pause and seek-to-60 reflected in both actual video and validated events.
- Quality selection, captions, fullscreen, background/foreground and network interruption.
- Provider activation errors, stalled progress and unavailable episodes produce recovery options rather than a false success label.
- Reload replaces only the local frame. No automatic reload loops or source switching.

| Browser/device   | Movie controls | TV controls/content | Resume/recovery | Result  |
| ---------------- | -------------- | ------------------- | --------------- | ------- |
| Desktop Chrome   | Not run        | Not run             | Not run         | Pending |
| Android Chrome   | Not run        | Not run             | Not run         | Pending |
| Samsung Internet | Not run        | Not run             | Not run         | Pending |
| iPhone Safari    | Not run        | Not run             | Not run         | Pending |

If any required control is unsupported, leave the flag disabled and record the exact event/command failure. Do not replace synchronization with a countdown and call it equivalent.

## Observed provider blocker (2026-11-05)

The initial desktop test showed only same-frame `PLAYER_TITLE`/`PLAYER_UI` messages. Subsequent user-supplied logs confirmed validated playback events: positions 0.0, 0.2, 5.2 and 5.4 seconds, duration 9133 seconds, and playing then paused state. Desktop progress parsing therefore works. The reported startupMs=120604 is elapsed time from adapter creation to its first accepted event, including any time before the user activated the player; it is not an isolated buffering/startup measurement. The logs do not establish whether play/pause/seek commands caused these transitions. On iPhone Chrome, pressing play inside the provider iframe reported “media is unavailable.” Mobile playback and cross-device synchronization remain unverified; keep the feature flag disabled.

The development test page includes an explicit “Video is visibly playing” diagnostic checkbox. It allows sending fixed-origin play/pause/seek commands before telemetry is validated, solely to distinguish missing events from missing inbound control support. Status stays activation/unknown until valid events arrive. Observe the video directly and record each command's actual effect. A successful command without progress feedback still does not pass synchronized playback. Production adapters retain strict origin, frame and media checks; the checkbox is not available in rooms.

## Room acceptance

After the device gate, test two rooms of ten viewers against the flagged pilot API. Every viewer must activate their frame; selecting a title is not enough. Verify host/cohost policy, shared play/pause/seek, late joins, disconnect/reconnect, background return and switching to native or KissKH media. Native/individual routes should keep working with the flag disabled.

Healthy-network targets: drift within three seconds and convergence within ten seconds after activation. These are pilot targets, not measured guarantees. Embeds use seek correction above two seconds with a ten-second correction cooldown; native players retain speed nudges. VidSrc speed controls are disabled. Provider progress missing for 15 seconds while playing suspends automatic corrections; missing initial activation for 30 seconds shows unknown status. A buffering viewer never automatically pauses the room.

Use adapter tests and mocked iframe tests for deterministic protocol checks. `apps/api/test/sync.int.test.ts` includes persisted external state/authorization tests and a two-room, twenty-client socket test. Run it against the isolated integration database/Redis environment with:

```
pnpm --filter @jandi/api exec vitest run --project integration test/sync.int.test.ts
```

Record browser/device, network, title/episode, startup time, failed frame loads, missing events, drift and correction counts with each pilot run. Do not persist third-party stream URLs or infer buffer occupancy/quality from events the provider does not expose. Production global title availability is never inferred from a single viewer's success.

## KissKH comparison test

At `/dev/embed-controls`, select **KissKH · Experimental**. Supply a real KissKH episode ID (`ep=` on the provider episode page), not a TMDB episode number. The initial sample comes from the provider documentation and is not Money Heist.

After starting video inside the provider frame, explicitly enable the experimental checkbox and try pause, play and seek. These probes use the VidSrc envelope against the fixed KissKH origin; KissKH does **not** document support for that envelope. They are a compatibility experiment, not an implemented KissKH control contract. The page collects only bounded time/duration telemetry from the active KissKH frame. Sending a command and receiving outgoing events do not by themselves establish that the command took effect.

Record actual effects on desktop and the phone. KissKH rooms remain individual playback and the server continues rejecting unsupported transport commands. Do not enable or label KissKH synchronization until its command behavior and cross-device convergence have been verified.

## Local-phone test controls do not respond

The development server explicitly allows local IPv4 interface hostnames for Next.js dev assets and WebSocket requests. For other development hostnames or tunnels, set `WEB_DEV_ORIGINS` to a comma-separated list of hostnames without schemes, ports or paths. This allowlist does not change production CSP or API authentication/CORS.

After changing configuration, restart the Jandi dev server on its existing port. The test page renders its player and controls only after React activates; “Loading test controls” means JavaScript has not activated, so no playback-control conclusion can be drawn. “Test controls ready” confirms activation. If the page stays on the loading message, collect the dev terminal error and the browser's script/network error before testing provider commands.
