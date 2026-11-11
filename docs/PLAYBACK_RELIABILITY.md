# Playback reliability

## Current behavior

Solo movie playback first checks the local catalog, then attempts a KissKH direct stream when enabled. If that lookup or the player fails, Jandi checks the existing third-party embed automatically. The embed is a listed candidate, not proof of playback; it can fail independently or require a tap. The player reports an error only after the available path fails. Playback progress cannot be transferred reliably into an embed that does not provide a seek API.

KissKH direct resolution already races a primary and backup resolver for the same provider identity. This improves resolver availability, but does not provide an independent video source when KissKH or its media host is unavailable. Subtitle lookup merges supported tracks; alternatives are labeled because their timing may differ.

Watch Together stores a shared source identity and timeline. Do not silently switch a room to a different edition, provider numbering, or an embed without verified controls: participants might watch different scenes while the room reports that they are synchronized. A room-wide source change needs the host's authority, a shared versioned state update, and an explicit matching timeline.

## Provider pipeline to build

1. Define adapters that resolve a canonical movie ID or validated provider episode ID to candidate metadata: provider and edition identity, type (native HLS/MP4 or embed), expiry, supported controls, subtitles, quality, and availability. Each adapter must establish how it matches a title and episode before it is enabled.
2. Resolve independent adapters concurrently with bounded deadlines, in-flight coalescing, short-lived negative results and provider-specific circuit breakers. Never treat metadata, a listed URL, or an iframe load event as confirmed playback. Do not persist signed URLs in shared room state or logs.
3. Rank by observed device compatibility and room capabilities. Check the actual browser's CORS and codec support; a server-side HTTP success does not prove client playback. Permit only reviewed media origins in CSP. Respect provider restrictions and do not turn the API into an unrestricted media proxy.
4. For solo playback, try eligible candidates in order with a bounded startup timeout. Preserve position only when the candidates' timeline identity is verified; prevent fallback loops. An opaque embed cannot report failure reliably and may require user interaction.
5. For rooms, select an exact common source and edition in the authoritative room state. Switch only when timeline identity and controls are verified for all participants; otherwise tell the host and offer an explicit choice. Test play, pause, seek, late join, recovery, and iOS/Android behavior on real devices.
6. Associate subtitle candidates with episode, edition, language, and timing evidence. Prefer matching tracks; label alternatives and preserve per-viewer selection. Do not claim subtitles exist when the upstream supplies none.
7. Record privacy-safe resolver failure class, playback startup, buffering and success rates by provider and device, without media URLs or credentials. Use these measurements to disable unhealthy adapters and guide recovery. Bound concurrency and use caching so free-tier instances are not overwhelmed.

The FMHY pages list watch-party applications and streaming sites, not a common resolver protocol. Each candidate needs separate API documentation, integration permission, browser and sync testing, and a maintenance owner before it can join this pipeline. No source can guarantee every title or uninterrupted playback.
