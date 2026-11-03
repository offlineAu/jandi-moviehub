# Admin, Reports, Voice & Public Settings API (v1)

Base path: `/api/v1`. Conventions (errors, pagination, wrapping, guests) are those of
[`ENDPOINTS.md`](./ENDPOINTS.md). `PublicUser` is defined there.

## Access rules

- Every `/admin/*` route is **ADMIN-only**, except the ones marked **mod**, which `MODERATOR`s may
  also call (ADMIN always satisfies MODERATOR). Other users get `403 FORBIDDEN`; guests get
  `403 GUEST_NOT_ALLOWED`; anonymous callers get `401`.
- Every mutating admin action writes an `audit_logs` row: `{actorId, action, targetType, targetId,
metadata, ip}`. The metadata records what changed (field names, from/to values). It never holds
  secrets. Actions:
  `admin.user.update`, `admin.movie.create|update|delete`, `admin.license.create|update|verify|unverify`,
  `admin.media.create|upload|status`, `admin.room.close`, `admin.message.delete`,
  `admin.report.resolve`, `admin.setting.update`.
- Mutations need an allowed `Origin`, like every other cookie-authenticated unsafe request.

## Reports — `/reports`

| Method | Path            | Notes                                                              |
| ------ | --------------- | ------------------------------------------------------------------ |
| POST   | `/reports`      | Registered users only (no guests). `{targetType: 'USER'            | 'MESSAGE' | 'ROOM' | 'PLAYLIST', targetId: uuid, reason: string(3–500)}`→ 201`{report: Report}`. The target must exist (`404 NOT_FOUND`; system messages cannot be reported). Reporting yourself → `400 CANNOT_REPORT_SELF`. If the same reporter already has an OPEN report on the same target → `409 ALREADY_REPORTED`. Rate limit: 10/hour/user (`429`). |
| GET    | `/reports/mine` | Paginated `Report` list of the caller's own reports, newest first. |

```ts
type Report = {
  id;
  targetType;
  targetId;
  reason;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  resolutionNote: string | null;
  createdAt;
  resolvedAt: string | null;
};
```

## Overview & analytics

| Method | Path                       | Notes                                                                                                         |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/overview`          | Live DB counts (see below).                                                                                   |
| GET    | `/admin/analytics?days=30` | `days` 1–365 (default 30). Zero-filled daily series in UTC, oldest first, exactly `days` points ending today. |
| GET    | `/admin/sync-stats`        | `SyncStats` (rolling drift samples reported by clients).                                                      |

```ts
type SyncStats = { samples; p50Ms; p90Ms; p95Ms; p99Ms; maxMs; within100ms; within250ms }; // null when no samples

type Overview = {
  users: { total; registered; guests; suspended; newLast7d }; // newLast7d excludes guests
  rooms: {
    open;
    createdLast7d;
    recentlyActiveRooms; // OPEN rooms with lastActiveAt in the last 10 min (approximates "rooms with sockets")
    recentlyActiveWindowMin: 10;
  };
  messages: { last24h }; // user messages (system notices excluded)
  movies: { total; playable }; // playable = has an APPROVED asset with a verified, in-window license
  mediaAssets: { PENDING; APPROVED; REJECTED; DISABLED };
  reports: { open };
  sync: SyncStats;
  generatedAt: string;
};

type Analytics = {
  days: number;
  from: 'YYYY-MM-DD';
  to: 'YYYY-MM-DD';
  series: Record<
    'signups' | 'roomsCreated' | 'messages' | 'watchHistoryUpdates',
    Array<{ date: 'YYYY-MM-DD'; count: number }>
  >;
  topMovies: Array<{ movieId; title; viewers }>; // ≤ 10, distinct users in watch_history within the window
};
```

`signups` counts registered (non-guest) accounts. `watchHistoryUpdates` buckets
`watch_history.last_watched_at`. There is one row per (user, movie), so the series counts the
(user, movie) pairs last touched on each day, not every progress write.

## Users

| Method | Path                                | Notes                                                                           |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/admin/users?q&role&page&pageSize` | `q` matches username, email, display name. Paginated `AdminUser`, newest first. |
| PATCH  | `/admin/users/:id`                  | `{role?: 'USER'                                                                 | 'MODERATOR' | 'ADMIN', suspended?: boolean}`→`{user: AdminUser}`. |

```ts
type AdminUser = PublicUser & {
  email: string | null;
  role;
  emailVerified: boolean;
  suspended: boolean;
  suspendedAt: string | null;
  lastSeenAt: string | null;
  createdAt;
};
```

Rules:

- Demoting or suspending the last active (non-suspended) ADMIN → `409 LAST_ADMIN`. Admin rows are
  locked during the check, so two concurrent demotions cannot both succeed.
- Changing your own role or suspending yourself → `403 SELF_MODIFICATION`.
- Guests cannot be given a platform role → `400 GUEST_ROLE`.
- Suspending deletes all of the user's sessions and disconnects their sockets. Suspended users
  cannot authenticate (`401`). Unsuspending does not restore sessions.

## Catalog: movies

| Method | Path                         | Notes                                                                                                                                                                                                                                                                 |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/movies?q&source=TMDB | LOCAL&page&pageSize`                                                                                                                                                                                                                                                  | Paginated `AdminMovie`. |
| POST   | `/admin/movies`              | `adminMovieSchema`: `{title, overview?, releaseDate?: 'YYYY-MM-DD', runtimeMin?, genres?: string[] (≤10), posterUrl?, backdropUrl?, isDemo?}` → 201 `{movie}`. The movie is created with `source: 'LOCAL'`. Genres are matched by name (case-insensitive) or created. |
| PATCH  | `/admin/movies/:id`          | Partial version of the same body. An omitted field is unchanged; `null` clears `overview`, `releaseDate`, `runtimeMin`, `posterUrl`, `backdropUrl`; `genres` replaces the set. Only LOCAL movies can be edited (TMDB titles → `409 TMDB_MANAGED`). → `{movie}`        |
| DELETE | `/admin/movies/:id`          | 204. Cascades to the movie's media assets, favorites, history and so on.                                                                                                                                                                                              |

```ts
type AdminMovie = {
  id;
  title;
  source;
  tmdbId: number | null;
  isDemo;
  overview;
  releaseDate: string | null;
  runtimeMin;
  posterUrl;
  backdropUrl;
  genres: string[];
  assetCount;
  playable;
  createdAt;
  updatedAt;
};
```

## Catalog: licenses

| Method | Path                                  | Notes                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/licenses?q&type&verified=true | false&page&pageSize`                                                                                                                                                                                                                                            | Paginated `AdminLicense`. |
| POST   | `/admin/licenses`                     | `adminLicenseSchema`: `{type, title, licensor, territory?='WORLDWIDE', provenanceUrl?, attribution?, validFrom?, validUntil? (ISO datetimes), notes?}` → 201 `{license}`. New licenses start unverified. `validUntil ≤ validFrom` → 400.                        |
| PATCH  | `/admin/licenses/:id`                 | Partial body (`null` clears optional fields) → `{license}`. Changing a **material** term (`type`, `licensor`, `territory`, `provenanceUrl`, `validFrom`, `validUntil`) of a verified license clears the verification, and the new terms must be verified again. |
| POST   | `/admin/licenses/:id/verify`          | Sets `verifiedAt` = now and `verifiedBy` = caller → `{license}`                                                                                                                                                                                                 |
| POST   | `/admin/licenses/:id/unverify`        | Clears the verification → `{license}`. Approved assets stop being playable straight away.                                                                                                                                                                       |

```ts
type AdminLicense = {
  id;
  type;
  title;
  licensor;
  territory;
  provenanceUrl;
  attribution;
  validFrom;
  validUntil;
  notes;
  verified: boolean;
  verifiedAt;
  verifiedBy: PublicUser | null;
  usable: boolean; // verified and now within [validFrom, validUntil)
  assetCount;
  createdAt;
  updatedAt;
};
```

## Catalog: media assets

| Method | Path                                        | Notes                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/media?status&movieId&page&pageSize` | Paginated `AdminMediaAsset`.                                                                                                                                                                                                                                                                                                                         |
| POST   | `/admin/media/upload`                       | `multipart/form-data`, a single field `file`, at most **500 MB** (`413` above that). The upload is streamed to a temp file. Only WebM (`1A 45 DF A3`) or MP4 (`ftyp` at byte 4) is accepted, detected by magic bytes (`415 UNSUPPORTED_MEDIA_TYPE` otherwise; the client file name and type are ignored). The file is stored as `uploads/<uuid>.webm | mp4`→ 201`{upload: {storageKey, format: 'WEBM' | 'MP4', mimeType, sizeBytes, storageDriver}}`. No file → `400 FILE_REQUIRED`. Rate limit: 30/hour/admin.                                                                                                                                                                   |
| POST   | `/admin/media`                              | Registers a file that is already in storage. `adminMediaAssetSchema`: `{movieId, licenseId, format: 'MP4'                                                                                                                                                                                                                                            | 'WEBM'                                         | 'HLS', storageKey, mimeType ('' = default for the format), durationSec, label?}`→ 201`{asset}`(status`PENDING`). For HLS, `storageKey`is a directory that must contain`index.m3u8`. A missing file → `400 MEDIA_FILE_MISSING`; an unsafe key → `400 INVALID_STORAGE_KEY`. |
| PATCH  | `/admin/media/:id/status`                   | `{status: 'PENDING'                                                                                                                                                                                                                                                                                                                                  | 'APPROVED'                                     | 'REJECTED'                                                                                                                                                                                                                                                                | 'DISABLED'}`→`{asset}`. **APPROVED requires the linked license to be verified and in its validity window** (`409 LICENSE_NOT_VERIFIED`otherwise). It sets`approvedBy`/`approvedAt`; any other status clears them. |

```ts
type AdminMediaAsset = {
  id;
  movie: { id; title };
  license: { id; title; type; verified: boolean; usable: boolean };
  label;
  format;
  storageDriver: 'LOCAL' | 'S3';
  storageKey;
  mimeType;
  durationSec;
  sizeBytes: number | null; // null for HLS
  status;
  approvedAt;
  approvedBy: PublicUser | null;
  playable: boolean;
  createdAt;
  updatedAt;
};
```

Typical flow: `POST /admin/media/upload` → `POST /admin/media` with the returned `storageKey` →
`POST /admin/licenses/:id/verify` → `PATCH /admin/media/:id/status {status:'APPROVED'}`.

## Moderation: rooms, messages, reports, audit

| Method | Path                                             | Notes                                                                                                                                                                                                      |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/rooms?status=OPEN                        | CLOSED&q&page&pageSize`                                                                                                                                                                                    | **mod**. All visibilities. `q` matches the name, the exact code or the host username. Paginated `{id, code, name, visibility, status, allowGuests, maxMembers, host: PublicUser, movie: {id,title} | null, memberCount, messageCount, onlineCount, createdAt, lastActiveAt, closedAt}`. |
| POST   | `/admin/rooms/:id/close`                         | **mod**. 204. Closes the room for everyone (`room:closed` with `by: 'admin'`). Audited as `admin.room.close`.                                                                                              |
| DELETE | `/admin/messages/:id`                            | **mod**. 204. Soft-deletes the message (`chat:deleted` broadcast). Audited as `admin.message.delete` with `{roomId, authorId}`.                                                                            |
| GET    | `/admin/reports?status&targetType&page&pageSize` | **mod**. Paginated `AdminReport`. With `status=OPEN` the list is oldest first; otherwise newest first.                                                                                                     |
| PATCH  | `/admin/reports/:id`                             | **mod**. `{status: 'RESOLVED'                                                                                                                                                                              | 'DISMISSED', resolutionNote?: string(≤500)}`→`{report: Report}`.                                                                                                                                   |
| GET    | `/admin/audit?action&actorId&page&pageSize`      | **mod**. Newest first. `action` matches exactly or as a dotted prefix (`admin.user` matches `admin.user.update`). Paginated `{id, action, targetType, targetId, metadata, ip, createdAt, actor: PublicUser | null}`.                                                                                                                                                                                            |

```ts
type AdminReport = Report & {
  reporter: PublicUser | null;
  resolvedBy: PublicUser | null;
  target:
    // null when the target has since been deleted
    | { type: 'USER'; user: PublicUser; suspended: boolean }
    | {
        type: 'MESSAGE';
        id;
        body;
        deleted: boolean;
        createdAt;
        author: PublicUser | null;
        room: { id; name };
      }
    | { type: 'ROOM'; id; name; code; status; visibility; host: PublicUser }
    | { type: 'PLAYLIST'; id; name; visibility; owner: PublicUser }
    | null;
};
```

## Settings

| Method | Path                   | Notes                                                                                                                                                                                                                                                                                                                      |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/settings`      | `{items: [{key, value, defaultValue, isDefault, public, description, updatedAt, updatedBy: PublicUser                                                                                                                                                                                                                      | null}]}` for every known key. |
| PUT    | `/admin/settings/:key` | `{value: JSON}` → `{setting: {key, value}}`. Keys must match `^[a-z0-9_.-]{2,64}$` after lower-casing (`400 INVALID_SETTING_KEY`). Keys are resolved case-insensitively to their canonical spelling. Unknown keys → `400 UNKNOWN_SETTING`. Values are validated per key (`400 VALIDATION_FAILED`, details paths `value…`). |
| GET    | `/settings/public`     | **Public** (no auth) → `{settings: {'site.announcement': string, 'registration.enabled': boolean}}`                                                                                                                                                                                                                        |

| Key                       | Type                                | Default | Public |
| ------------------------- | ----------------------------------- | ------- | ------ |
| `site.announcement`       | string ≤ 280 (trimmed; `''` = none) | `''`    | yes    |
| `rooms.maxMembersDefault` | integer 2–100                       | `20`    | no     |
| `chat.slowModeSec`        | integer 0–60                        | `0`     | no     |
| `registration.enabled`    | boolean                             | `true`  | yes    |

> These are stored and exposed only. Registration, room creation and chat do **not** enforce them
> yet. Other modules can read them through the exported `SettingsService.get(key)`.

## Voice (LiveKit)

| Method | Path                         | Notes                                                                                                                                                                                                                   |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/voice/status`              | **Public** → `{configured: boolean}`. `true` only when `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are all set.                                                                                           |
| POST   | `/rooms/:roomId/voice-token` | guest-ok, active room members only (`403 NOT_IN_ROOM`, `409 ROOM_CLOSED`). → `{url, token, expiresAt}`, `Cache-Control: no-store`. Without LiveKit configuration → `503 VOICE_NOT_CONFIGURED`. Rate limit: 30/min/user. |

The token is a LiveKit access token: an HS256 JWT signed with `LIVEKIT_API_SECRET`. Its claims are
`iss` = API key, `sub` = user id, `name` = display name, `jti`, `iat`, `nbf`, `exp` (1 h, never
more than 2 h) and `video: {room: <roomId>, roomJoin: true, canPublish: true, canSubscribe: true}`.
The API only mints tokens. Audio itself goes through the LiveKit server, so voice does not work
without one.
