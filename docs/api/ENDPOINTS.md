# REST API Contract (v1)

Base path: `/api/v1`. Live OpenAPI: `GET /api/docs` (UI) and `/api/docs/openapi.json`.
The web app calls these through the Next.js rewrite (same origin), so paths are relative.

## Conventions

- **Auth:** session cookie `jandi_session` (HttpOnly, SameSite=Lax). Unsafe methods carrying the
  cookie must send an allowed `Origin` (browsers do this automatically).
- **Errors:** `{ "error": { "code": "STRING", "message": "Human text", "details"?: any }, "requestId": "…" }`.
  Common codes: `VALIDATION_FAILED` (400, details = `[{path, message}]`), `UNAUTHENTICATED` (401),
  `FORBIDDEN` / `GUEST_NOT_ALLOWED` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429, `Retry-After`).
- **Pagination:** query `page` (1-based), `pageSize` (≤ 50). Response
  `{ items: T[], page, pageSize, total, totalPages }`. Non-paginated lists: `{ items: T[] }`.
- **Single resources** are wrapped: `{ user }`, `{ movie }`, `{ room }`, `{ playlist }` …
- **Guests** (`user.isGuest`) may only call routes marked _guest-ok_.
- Dates are ISO-8601 strings.

## Shared DTOs

```ts
type PublicUser = { id; username; displayName; avatarUrl: string | null; isGuest: boolean };

type Me = PublicUser & {
  email: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  emailVerified: boolean;
  bio: string | null;
  preferences: {
    autoplayNext;
    captionsByDefault;
    defaultVolume;
    reduceMotion;
    browserNotifications;
  };
  privacy: {
    profileVisibility;
    watchHistoryVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
    showOnlineStatus;
    discoverable;
  };
  createdAt;
};

type MovieSummary = {
  id: string; // internal UUID (stable, also for TMDB titles)
  title: string;
  year: number | null;
  releaseDate: string | null; // YYYY-MM-DD
  overview: string | null;
  posterUrl: string | null; // absolute (TMDB CDN) or relative (/api/v1/catalog/artwork/...)
  backdropUrl: string | null;
  voteAverage: number | null; // 0–10
  runtimeMin: number | null;
  genres: string[]; // genre names
  playable: boolean; // has an APPROVED asset with a verified, in-window license
  isDemo: boolean; // demonstration content (must be labelled in UI)
  source: 'TMDB' | 'LOCAL';
};

type MovieDetail = MovieSummary & {
  tagline: string | null;
  originalTitle: string | null;
  originalLanguage: string | null;
  voteCount: number | null;
  cast: Array<{ name: string; character: string | null; profileUrl: string | null }>;
  trailers: Array<{ site: 'YouTube' | 'Vimeo'; key: string; name: string }>; // embed only
  media: Array<{ id: string; label: string; format: 'MP4' | 'WEBM' | 'HLS'; durationSec: number }>;
  license: { type: string; licensor: string; attribution: string | null } | null;
  attribution: string | null;
};

type PlaybackSource = {
  assetId: string;
  label: string;
  format: 'MP4' | 'WEBM' | 'HLS';
  mimeType: string;
  durationSec: number;
  url: string; // signed, expiring
  captions: Array<{ lang: string; label: string; url: string }>;
  license: { type: string; attribution: string | null };
};
```

## Auth — `/auth` (implemented)

`POST /auth/socket-ticket`: authenticated users and guests receive 201 `{ticket, expiresIn: 60}`
with `Cache-Control: no-store`. Exchange the single-use ticket in Socket.IO's `auth.ticket`
handshake field. Limited to 60 tickets per user per minute; normal origin checks apply.

| Method | Path                                         | Notes                                                                       |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/auth/register`                             | `{email, username, displayName, password}` → 201 `{user: Me}` + cookie      |
| POST   | `/auth/login`                                | `{email, password}` → `{user: Me}` + cookie                                 |
| POST   | `/auth/guest`                                | `{displayName}` → 201 `{user: Me}` (isGuest)                                |
| POST   | `/auth/logout`                               | 204                                                                         |
| GET    | `/auth/me`                                   | guest-ok → `{user: Me}`                                                     |
| POST   | `/auth/verify-email`                         | `{token}` → 204                                                             |
| POST   | `/auth/verify-email/resend`                  | 204                                                                         |
| POST   | `/auth/password-reset/request`               | `{email}` → 202 (always)                                                    |
| POST   | `/auth/password-reset/confirm`               | `{token, password}` → 204, revokes sessions                                 |
| POST   | `/auth/password`                             | `{currentPassword, newPassword}` → 204                                      |
| GET    | `/auth/sessions`                             | `{items: [{id, createdAt, lastUsedAt, expiresAt, ip, userAgent, current}]}` |
| DELETE | `/auth/sessions/:id`                         | 204                                                                         |
| GET    | `/auth/oauth/providers`                      | `{items: [{id, name}]}` (empty when unconfigured)                           |
| GET    | `/auth/oauth/:provider/start?returnTo=/path` | 302 to provider                                                             |

Dev only: `GET /dev/mail?to=email` → `{items: [{id, to, subject, text, sentAt}]}`.

## Catalog — `/movies`, `/genres`, `/catalog`

| Method | Path                              | Notes                                                                                                                                                                                                                      |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/catalog/info`                   | public → `{provider: 'tmdb'                                                                                                                                                                                                | 'local', label, attribution, attributionUrl}` |
| GET    | `/movies`                         | public. Query: `category` (trending/popular/recent/upcoming/top-rated), `genre` (slug), `q`, `year`, `minRating`, `playable=true`, `sort` (popularity/rating/release/title), `page`, `pageSize` → paginated `MovieSummary` |
| GET    | `/movies/:id`                     | public → `{movie: MovieDetail}`                                                                                                                                                                                            |
| GET    | `/movies/:id/similar`             | public → `{items: MovieSummary[]}` (≤ 12)                                                                                                                                                                                  |
| GET    | `/movies/:id/recommendations`     | public → `{items: MovieSummary[]}` (≤ 12)                                                                                                                                                                                  |
| GET    | `/movies/:id/playback`            | auth (not guest) → `{sources: PlaybackSource[]}`; 404 `NOT_PLAYABLE` if none                                                                                                                                               |
| GET    | `/genres`                         | public → `{items: [{id, name, slug}]}`                                                                                                                                                                                     |
| GET    | `/catalog/artwork/:file`          | public, generated poster/backdrop SVGs for local titles                                                                                                                                                                    |
| GET    | `/media/:assetId/:exp/:sig/*path` | signed media delivery (Range supported; HLS playlists + segments)                                                                                                                                                          |

## Library

| Method | Path                              | Notes                                                                                                                                                               |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/favorites`                      | paginated `{movie: MovieSummary, createdAt}`                                                                                                                        |
| PUT    | `/favorites/:movieId`             | 204 (idempotent)                                                                                                                                                    |
| DELETE | `/favorites/:movieId`             | 204                                                                                                                                                                 |
| GET    | `/watchlists`                     | `{items: [{id, name, description, isDefault, isGroup, itemCount, owner: PublicUser, members: PublicUser[], previewPosters: string[]}]}` (owned + group memberships) |
| POST   | `/watchlists`                     | `{name, description?}` → 201 `{watchlist}`                                                                                                                          |
| GET    | `/watchlists/:id`                 | owner/member → `{watchlist, items: [{id, movie: MovieSummary, addedBy: PublicUser                                                                                   | null, createdAt}]}` |
| PATCH  | `/watchlists/:id`                 | owner → `{watchlist}`                                                                                                                                               |
| DELETE | `/watchlists/:id`                 | owner; default list cannot be deleted (409)                                                                                                                         |
| POST   | `/watchlists/:id/items`           | `{movieId}` → 201 (409 if present)                                                                                                                                  |
| DELETE | `/watchlists/:id/items/:movieId`  | 204                                                                                                                                                                 |
| POST   | `/watchlists/:id/members`         | owner; `{username}` must be a friend → makes it a group list                                                                                                        |
| DELETE | `/watchlists/:id/members/:userId` | owner, or the member leaving                                                                                                                                        |
| GET    | `/movies/:id/library-status`      | `{favorite: boolean, watchlistIds: string[], progress: {positionSec, durationSec, completed}                                                                        | null}`              |
| GET    | `/history`                        | paginated `{movie, positionSec, durationSec, completed, lastWatchedAt}`                                                                                             |
| GET    | `/history/continue`               | `{items: same shape}` — unfinished, position ≥ 30 s, newest first, ≤ 20                                                                                             |
| PUT    | `/history/progress`               | `{movieId, positionSec, durationSec?}` → 204 (completed when ≥ 95 %)                                                                                                |
| DELETE | `/history/:movieId`               | 204                                                                                                                                                                 |
| DELETE | `/history`                        | 204 clears all                                                                                                                                                      |

## Profiles & users

| Method | Path                      | Notes                                                                            |
| ------ | ------------------------- | -------------------------------------------------------------------------------- |
| PATCH  | `/profiles/me`            | `{displayName?, bio?, preferences?, privacy?}` → `{user: Me}`                    |
| POST   | `/profiles/me/avatar`     | multipart `file` (PNG/JPEG/WebP/GIF, ≤ 2 MB, magic-byte checked) → `{avatarUrl}` |
| DELETE | `/profiles/me/avatar`     | 204                                                                              |
| GET    | `/profiles/avatars/:file` | public image                                                                     |
| GET    | `/profiles/:username`     | public → `{profile: PublicUser & {bio, createdAt, friendship: 'self'             | 'friends' | 'outgoing' | 'incoming' | 'none', stats: {favorites, playlists}}, favorites?: MovieSummary[], history?: [...] }`—`favorites`/`history` only when allowed by privacy settings |
| GET    | `/users/search?q=`        | discoverable, non-guest users → `{items: PublicUser & {friendship}}`             |

## Rooms, sync, chat, playlists, marathon, social, notifications, admin

Documented in `docs/api/ROOMS.md` and `docs/api/REALTIME.md` as they are implemented.

### Series and episodes

- `GET /api/v1/series?q=&country=&language=&genre=&year=&page=` — public, paginated series search. Language, genre and year match the metadata of the same episode.
- `GET /api/v1/series/:id` — ordered episodes, each with current playable status.
- `POST /api/v1/playlists/from-series/:id` — authenticated user creates a private ordered snapshot of up to 200 episodes; empty or larger series are rejected. Availability is checked again during playback. Optional `?fromMovieId=<uuid>` starts the snapshot at that episode (404 if it is not in the series). The web "Watch series together" action sends the new playlist to `/rooms/new?playlistId=` to run it as a marathon.
- `POST /api/v1/admin/series` — administrator creates a series (`title`, optional `country` and `description`).
- `POST /api/v1/admin/series/:id/episodes` — administrator assigns an existing movie as an episode (`movieId`, `seasonNumber`, `episodeNumber`). A movie can belong to one episode. Approval and license requirements continue to apply to the movie's media.
- `PATCH /api/v1/admin/series/:id` and `DELETE /api/v1/admin/series/:id` — update or remove a series. Removing a series preserves its movie and media records.
- `DELETE /api/v1/admin/series/:id/episodes/:episodeId` — detach an episode without deleting its movie or media.
- `PATCH /api/v1/admin/series/:id/episodes/:episodeId` — change the episode's season and episode numbers; existing positions cannot be duplicated.
- `GET /api/v1/movies/:id/series-navigation` — `{ navigation: { kind, series: {id, title}, current: {seasonNumber, episodeNumber}, previous, next } | null }`. `kind: 'series'` for local series; otherwise `kind: 'tv'` for an admin-linked TMDB episode, navigating only the show's other linked episodes (`series.id` is the TMDB id; title falls back to `"TV series"` when TMDB is unavailable). `previous`/`next` carry `movieId`, season/episode numbers and current `playable`. Used for solo prev/next and the in-room episode bar.
- `GET /api/v1/tv/:id/seasons/:season/episodes/:episode/availability` — `{ playable, movieId }`; `movieId` is the linked licensed title when playable (else `null`) so clients can open a watch party on it.
- `GET /api/v1/admin/source-candidates/commons?q=` — search Commons for unverified video candidates. Results are not licenses or playable media.
- `POST /api/v1/admin/source-candidates/commons` — save a candidate by numeric `pageId`; metadata is re-fetched from Commons and deduplicated. `GET /api/v1/admin/source-candidates?page=` lists the saved queue; `DELETE /api/v1/admin/source-candidates/:id` removes a candidate. All require an administrator.
