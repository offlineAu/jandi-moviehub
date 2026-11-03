# Screenshot film playback: provider inquiry and implementation handoff

Status: BLOCKED on an authorized provider and a verified playable source. The target is
The Dark Knight (2008), visible in the user's screenshot; another title from that screenshot is
acceptable if its licensed, hosted playback is confirmed first. No title is claimed playable.

## Findings, 2026-11-01

- TMDB credentials are configured, but TMDB supplies metadata rather than video rights.
- `CatalogService.getPlaybackSources` returns approved local media assets with verified,
  in-window licenses and server-generated signed URLs. The existing `VideoPlayer` handles those
  sources. It does not yet resolve a commercial provider's playback session or enforce geographic
  licensing for a third-party stream.
- No Filmhub or FilmOn credentials were found under the corresponding API-key names in the API
  environment. No provider agreement, entitlement, documented session API, or title match was
  confirmed. These variable names are a configuration check, not an assertion that either provider
  uses such keys.
- Filmhub offers licensing to buyers: https://filmhub.com/buyers. Its page describes delivery but
  does not establish hosted playback, API access, the target title, Philippines rights, cost, or
  eligibility for a personal project. Contact its licensing team using the buyer page.
- FilmOn's https://www.filmon.com/page/api-vod describes registered application access to a VOD
  catalog, but the beta document uses HTTP examples. Current access, secure endpoints, rights,
  title coverage, and in-app playback permission have not been verified.
- Neither catalog listings nor possession of a TMDB key or consumer streaming subscription grants
  Jandi permission to deliver the underlying video.

## Draft inquiry — for the owner to review and send

**Subject:** Licensing and hosted playback for a small Philippines-based movie website

Hello, I am building Jandi MovieHub, a personal movie-discovery and watch-party website based in
the Philippines. I would like to license at least one movie for playback directly within my
existing web app, initially for a small private audience.

1. Do you offer rights for The Dark Knight (2008) in the Philippines? If not, can you provide
   availability for Wildwood, Hope, Drive - The Pretenders, Fall 2: Deadpoint, Apocalypse Z:
   New World, Verity, or the Spider-Man title shown in our catalog? We can confirm the exact
   canonical title and year before contracting.
2. Can you provide a hosted, embeddable player or a supported streaming session API, so I do not
   need to upload or host the video? Please share current API/SDK documentation and test access.
3. Do the rights cover playback inside a custom website in the Philippines, and for how long?
   Are personal sites accepted? What geographic, subscription, account, device, DRM, and
   concurrent-viewer requirements apply?
4. Are synchronized watch parties permitted when each viewer has their own authorized session?
   May the player be controlled using supported play, pause, and seek APIs?
5. What are the fees, minimum commitments, reporting requirements, and available plans?

Thank you.

## Integration after provider confirmation

1. Record the exact provider, canonical movie ID, permitted territories, rights window, supported
   delivery method, session lifetime, and written authorization; do not store secrets in Git.
2. Implement only the provider's documented authenticated session API. Resolve sessions on the
   server, validate the canonical movie match and access, use HTTPS and provider-approved hosts,
   and enforce territorial restrictions with a trusted mechanism. Return an explicit unavailable
   or authorization error if the provider cannot establish access.
3. Integrate its documented player or HLS/MP4 response with the movie detail/playback flow, while
   preserving existing local source behavior. Keep provider secrets and signed sessions out of
   logs, cacheable responses, and shared room events. Do not add an arbitrary URL proxy.
4. Implement room synchronization only if the provider permits it and the player exposes the
   necessary controls; each participant obtains an independent authorized session.
5. Test session creation, expiry, errors, authorization, territory, title matching, and existing
   local playback. Then use the real provider to play the exact full film in a browser and verify
   video, audio, pause, resume and seek; document the evidence separately from mocked tests.

No outreach, enrollment, agreement, payment, or deployment has been performed.
