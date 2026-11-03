# Blockers & External Dependencies

| ID   | Item                                              | Impact                                                 | Workaround                                                                                           | Status   |
| ---- | ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------- |
| B-01 | Docker not installed on dev machine               | Cannot run `docker compose` or build images locally    | Native Postgres/Redis used; Dockerfiles + compose authored, CI build configured but not yet observed | OPEN     |
| B-02 | TMDB credentials configured                       | Live metadata depends on the upstream service          | Keep the local labelled catalog available when appropriate                                           | RESOLVED |
| B-03 | No SMTP credentials                               | Real email delivery unavailable                        | Dev transport writes `.data/mail/*.json`, exposed at `/api/v1/dev/mail` (non-production only)        | OPEN     |
| B-04 | No S3 credentials                                 | Object storage unavailable                             | Local filesystem driver with HMAC-signed URLs; S3 driver implemented                                 | OPEN     |
| B-05 | No OAuth app credentials                          | Social login unavailable                               | Adapter disabled; providers listed only when configured                                              | OPEN     |
| B-06 | No LiveKit server/credentials                     | Voice chat unavailable                                 | Token endpoint returns 503 `VOICE_NOT_CONFIGURED`; UI hides voice                                    | OPEN     |
| B-07 | No authorized hosted source for a screenshot film | Cannot play the requested commercial film inside Jandi | Provider inquiry and integration prerequisites: `docs/SCREENSHOT_FILM_PLAYBACK.md`                   | OPEN     |

- MovieBox live verification (2026-11-02): current execution environment cannot resolve movie-box.co. Adapter/UI implemented against supplied payloads and tested with fixtures, but full playback and subtitle compatibility require local browser verification. Production build additionally blocked by Google Fonts DNS.
