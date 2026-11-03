# Security Review

Scope: API (`apps/api`), web (`apps/web`), infrastructure artifacts. Reviewed 2026-10-31.
"Test" column references `apps/api/test/*.int.test.ts` unless noted.

## Controls

| Area                     | Control                                                                                                                                                                                                      | Where                                               | Verified by                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------- |
| Passwords                | argon2id (19 MiB, t=2); dummy hash on unknown users (timing)                                                                                                                                                 | `auth/password.ts`                                  | auth: identical error for unknown/wrong                        |
| Sessions                 | 256-bit random token, SHA-256 at rest, HttpOnly, SameSite=Lax, `Secure` required in production (env validation), absolute expiry 30 d / guests 24 h, revocation on logout, password change/reset, suspension | `auth/session.service.ts`, `config/env.ts`          | auth: cookie flags, expiry, revocation                         |
| CSRF                     | Unsafe methods carrying the session cookie must have an allowed `Origin`/`Referer`                                                                                                                           | `common/guards.ts` (OriginGuard)                    | auth: cross-origin POST → 403                                  |
| WebSocket auth           | Cookie session at handshake; Origin allow-list (`allowRequest`); membership + role re-checked on every command                                                                                               | `realtime/io-adapter.ts`, `room.gateway.ts`         | sync: unauthenticated / cross-origin / non-member rejected     |
| Authorization            | Global AuthGuard (`@Public`, `@AllowGuest`, `@Roles`); room permission rules in one module; ownership checks in services                                                                                     | `common/guards.ts`, `rooms/room-access.ts`          | rooms matrix, library ownership, admin route sweep             |
| Playback authority       | Server-authoritative state, version CAS (Lua), idempotency keys, stale rejection, per-user command rate limit                                                                                                | `realtime/playback.service.ts`                      | sync: forbidden/stale/duplicate/concurrent                     |
| Input validation         | Zod on every body/query/socket payload; UUID params; control-character stripping                                                                                                                             | `common/zod.ts`, `packages/shared`                  | auth/rooms validation tests                                    |
| SQL injection            | Prisma parameterized queries; raw SQL only via tagged templates; LIKE wildcards escaped                                                                                                                      | services                                            | — (by construction)                                            |
| XSS                      | Chat/user text stored and returned verbatim and rendered as React text only (no `dangerouslySetInnerHTML`); SVG artwork XML-escaped; CSP on web and API                                                      | `chat/*`, `apps/web/next.config.ts`, `bootstrap.ts` | chat: payload inert; artwork tests                             |
| Rate limiting            | Redis fixed windows: global per-IP, login, register, reset, guest, invites, room joins, chat (burst/sustained/duplicate), reactions, playback commands, heartbeats                                           | `common/rate-limiter.service.ts`                    | auth 429, chat flood/spam                                      |
| Invites / room passwords | 256-bit invite tokens, SHA-256 at rest, shown once, expiry + max uses (atomic); room passwords argon2id; private rooms 404 by code                                                                           | `rooms/rooms.service.ts`                            | rooms tests                                                    |
| Media protection         | HMAC-SHA256 signed, expiring URLs (signature in path); license + approval re-checked per request; traversal rejected; S3 via presigned URLs                                                                  | `catalog/media-*.ts`, `storage/*`                   | media: tampered/expired 403, traversal 400                     |
| Uploads                  | Avatars ≤ 2 MB PNG/JPEG/WebP/GIF by magic bytes; admin video uploads WebM/MP4 by magic bytes; random storage keys                                                                                            | `users/*`, `admin/*`                                | profiles/admin upload tests                                    |
| Account enumeration      | Reset request always 202; login errors identical                                                                                                                                                             | `auth/*`                                            | auth                                                           |
| OAuth                    | Disabled without credentials; single-use `state` bound to a cookie; email-link only for provider-verified emails; safe `returnTo`                                                                            | `auth/oauth.service.ts`                             | auth (disabled path); live providers untested (no credentials) |
| Secrets                  | Env-only; validated at boot; example files contain no secrets; pino redaction of cookies, auth headers, passwords, tokens; query strings stripped from request logs                                          | `config/env.ts`, `observability/logging.ts`         | —                                                              |
| Error handling           | Uniform error body, no stack traces to clients, 5xx reported via ErrorReporter                                                                                                                               | `common/http-exception.filter.ts`                   | —                                                              |
| Privacy                  | Profile/history visibility levels, discoverability, online-status opt-out, private rooms masked in friend presence, guests not discoverable                                                                  | `users/*`, `social/*`                               | profiles, social                                               |
| Audit                    | Privileged and security-relevant actions recorded (`audit_logs`)                                                                                                                                             | `common/audit.service.ts`                           | admin tests                                                    |
| Headers                  | helmet on API (CSP, CORP, frameguard…); web CSP, nosniff, frame DENY, referrer policy, permissions policy                                                                                                    | `bootstrap.ts`, `next.config.ts`                    | —                                                              |
| Production guards        | Env validation refuses insecure cookies, dev mail transport, dev routes, rate-limit multiplier ≠ 1 in production                                                                                             | `config/env.ts`                                     | —                                                              |

## Dependency audit

`pnpm audit --prod` on 2026-10-31 initially reported 23 advisories (6 high) in `nodemailer`
(< 10.0.10), `multer` (2.4.0 via @nestjs/platform-express), `js-yaml` (5.3.0 via @nestjs/swagger)
and `deepmerge-ts` (via prisma). Resolved by upgrading nodemailer to 10.3.1 and pnpm overrides
(`multer` 2.5.0, `js-yaml` 5.5.0, `deepmerge-ts` 8.0.2). Re-audit: **No known vulnerabilities
found**; full integration suite re-run green afterwards.

Subsequent audit on 2026-10-31: `pnpm audit --prod` reported two moderate minimatch findings
([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)) through the shared
ESLint configuration's tooling dependencies. `pnpm audit --prod --audit-level high` passed.
Assess a compatible patched dependency update before release; these findings supersede the earlier
zero-vulnerability result.

## Known limitations / residual risk

The Wikimedia Commons discovery adapter makes requests only to the fixed Commons API host and
does not download video. Candidate metadata is untrusted and does not authorize playback. A
separate rights and media approval step is required. Source results can change or be removed.

- Rate limits are per IP / per user fixed windows; distributed abuse needs an edge WAF.
- No email-based MFA/2FA. OAuth flows untested against live providers.
- Signed media URLs are bearer URLs until expiry (default 6 h) — sharing a URL shares access for
  that window. DRM is out of scope (only owned/public-domain/CC/licensed media is served).
- Local storage driver serves files from the API process; large-scale delivery should use S3 +
  CDN with signed URLs.
- Docker images were authored but not built locally (Docker unavailable — see BLOCKERS B-01).
- CSP allows `'unsafe-inline'` scripts/styles (Next.js inline bootstrap); a nonce-based CSP is a
  hardening follow-up.
