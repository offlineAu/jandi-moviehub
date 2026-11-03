# Rooms, Playlists, Marathons, Social — REST contract

Conventions as in `ENDPOINTS.md`. _guest-ok_ = guest sessions allowed.

## DTOs

```ts
type MovieBrief = {
  id;
  title;
  posterUrl;
  backdropUrl;
  year: number | null;
  runtimeMin: number | null;
  isDemo: boolean;
};

type Room = {
  id;
  code: string /* 8 chars, A-Z2-9 w/o ambiguous */;
  name;
  description: string | null;
  visibility: 'PUBLIC' | 'PRIVATE' | 'PASSWORD' | 'FRIENDS';
  status: 'OPEN' | 'CLOSED';
  allowGuests: boolean;
  controlPolicy: 'HOST_ONLY' | 'HOSTS' | 'EVERYONE';
  maxMembers: number;
  scheduledFor: string | null;
  createdAt;
  lastActiveAt;
  requiresPassword: boolean;
  host: PublicUser;
  movie: MovieBrief | null;
  memberCount: number;
  onlineCount: number;
  membership: { role: 'HOST' | 'COHOST' | 'MEMBER'; joinedAt } | null; // viewer's membership
};
```

`controlPolicy`: `HOST_ONLY` – only the host controls playback; `HOSTS` – host + co-hosts (default);
`EVERYONE` – any member.

## Rooms

| Method              | Path                                      | Notes                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET                 | `/rooms?q&page&pageSize`                  | public discovery — **PUBLIC + OPEN only** (paginated `Room`)                                                                                                                                                                                                       |
| GET                 | `/rooms/mine`                             | guest-ok; rooms I'm an active member of → `{items: Room[]}`                                                                                                                                                                                                        |
| GET                 | `/rooms/friends`                          | friends-only/public rooms hosted by my friends                                                                                                                                                                                                                     |
| POST                | `/rooms`                                  | `createRoomSchema`: `{name, description?, visibility, password? (required for PASSWORD), movieId?, allowGuests=false, controlPolicy='HOSTS', maxMembers=20, scheduledFor?}` → 201 `{room}`                                                                         |
| GET                 | `/rooms/code/:code?invite=token`          | public preview → `{room, access: {banned, isMember, requiresPassword, guestBlocked}}`. **404** for private rooms (and friends-only rooms for non-friends) unless member or valid invite. Password rooms return a minimal card (no description/movie) until joined. |
| GET                 | `/rooms/:id`                              | guest-ok, members → `{room}`                                                                                                                                                                                                                                       |
| PATCH               | `/rooms/:id`                              | host → `{room}` (partial; omitted fields unchanged)                                                                                                                                                                                                                |
| DELETE              | `/rooms/:id`                              | host closes room → 204 (`room:closed` broadcast)                                                                                                                                                                                                                   |
| POST                | `/rooms/:id/join`                         | guest-ok; `{password?, inviteToken?}` → `{membership: {role, alreadyMember}}`. Errors: `BANNED`, `GUESTS_NOT_ALLOWED`, `PASSWORD_REQUIRED`, `WRONG_PASSWORD`, `FRIENDS_ONLY`, `INVITE_REQUIRED` (403), `ROOM_FULL`, `ROOM_CLOSED` (409)                            |
| POST                | `/rooms/:id/leave`                        | guest-ok → 204 (host leaving auto-transfers host)                                                                                                                                                                                                                  |
| GET                 | `/rooms/:id/members`                      | guest-ok → `{items: [{userId, role, joinedAt, online, user: PublicUser}]}`                                                                                                                                                                                         |
| PATCH               | `/rooms/:id/members/:userId`              | host; `{role: 'COHOST'                                                                                                                                                                                                                                             | 'MEMBER'}` → 204 |
| DELETE              | `/rooms/:id/members/:userId`              | kick (host: anyone but self; co-host: members only) → 204                                                                                                                                                                                                          |
| GET / POST / DELETE | `/rooms/:id/bans[/:userId]`               | host/co-host; POST body `{reason?}` bans + removes                                                                                                                                                                                                                 |
| POST                | `/rooms/:id/transfer`                     | host; `{userId}` → 204 (old host becomes co-host)                                                                                                                                                                                                                  |
| POST                | `/rooms/:id/invites`                      | host/co-host (any member for PUBLIC rooms); `{maxUses?, expiresInHours=72, inviteeUserId?}` → 201 `{invite: {id, token, url, expiresAt, maxUses, uses}}` — **token shown once** (only its SHA-256 is stored). `inviteeUserId` also sends a notification.           |
| GET                 | `/rooms/:id/invites`                      | host/co-host → active invites (no tokens)                                                                                                                                                                                                                          |
| DELETE              | `/rooms/:id/invites/:inviteId`            | revoke                                                                                                                                                                                                                                                             |
| GET                 | `/invites/:token`                         | public → `{room, invite: {expiresAt, forSpecificUser}}` (404 if invalid/expired/used up)                                                                                                                                                                           |
| GET                 | `/rooms/:id/playback-state`               | guest-ok → `{state: PlaybackState, serverTime}`                                                                                                                                                                                                                    |
| GET                 | `/rooms/:id/playback-sources`             | guest-ok → `{movieId, movie: MovieSummary, sources: PlaybackSource[]}` (timeline asset first)                                                                                                                                                                      |
| GET                 | `/rooms/:id/messages?before=ISO&limit=50` | guest-ok → `{items: ChatMessageDto[] (oldest→newest), hasMore}`                                                                                                                                                                                                    |
| POST                | `/rooms/:id/messages`                     | guest-ok REST fallback → `{message}`                                                                                                                                                                                                                               |
| DELETE              | `/messages/:id`                           | author, room host/co-host, or platform moderator                                                                                                                                                                                                                   |
| POST                | `/rooms/:id/voice-token`                  | `{url, token}` or 503 `VOICE_NOT_CONFIGURED`                                                                                                                                                                                                                       |

## Marathons (`/rooms/:roomId/marathon`)

| Method | Path                                                  | Notes                                                                                                                                    |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | ``                                                    | guest-ok → `{marathon: MarathonSnapshot                                                                                                  | null}` |
| POST   | ``                                                    | host/co-host: `{playlistId, countdownSec=10, intermissionSec=30, votingEnabled=false, scheduledFor?}` → 201 `{marathon}` (state `READY`) |
| POST   | `/start` · `/skip` · `/previous` · `/stop` · `/retry` | host/co-host → `{marathon}`; 409 `INVALID_TRANSITION`                                                                                    |
| POST   | `/votes`                                              | guest-ok; `{playlistItemId}` during `INTERMISSION` with voting on                                                                        |
| DELETE | ``                                                    | host/co-host removes the marathon                                                                                                        |

States: `IDLE READY COUNTDOWN PLAYING INTERMISSION TRANSITIONING COMPLETED ERROR`. The server
advances the marathon (timers + end-of-movie detection); clients only display it.
`MarathonSnapshot` is defined in `packages/shared/src/sync/events.ts`.

## Playlists (`/playlists`)

```ts
type Playlist = {
  id;
  name;
  description;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  collaborative: boolean;
  owner: PublicUser;
  collaborators: PublicUser[];
  items: Array<{
    id;
    position;
    addedBy: PublicUser | null;
    createdAt;
    durationSec: number | null;
    movie: MovieBrief & { genres: string[]; playable: boolean };
  }>;
  itemCount;
  playableCount;
  totalRuntimeSec;
  canEdit;
  isOwner;
  sharePath;
  createdAt;
  updatedAt;
};
```

| Method         | Path                                   | Notes                                                                                |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| GET            | `/playlists`                           | mine + collaborations → `{items}`                                                    |
| GET            | `/playlists/public?page`               | public, non-empty (paginated)                                                        |
| POST           | `/playlists`                           | `{name, description?, visibility='PRIVATE', collaborative=false}` → 201 `{playlist}` |
| GET            | `/playlists/:id`                       | public route; PRIVATE → 404 unless owner/collaborator                                |
| PATCH / DELETE | `/playlists/:id`                       | owner (DELETE 409 `PLAYLIST_IN_USE` during an active marathon)                       |
| POST           | `/playlists/:id/items`                 | owner/collaborator `{movieId}` → 201 `{playlist}`                                    |
| DELETE         | `/playlists/:id/items/:itemId`         | → `{playlist}`                                                                       |
| PUT            | `/playlists/:id/order`                 | `{itemIds: [...all items in new order]}` → `{playlist}`                              |
| POST           | `/playlists/:id/collaborators`         | owner `{username}` → `{playlist}`                                                    |
| DELETE         | `/playlists/:id/collaborators/:userId` | owner, or the collaborator leaving                                                   |
| POST           | `/playlists/:id/duplicate`             | copy into my library (sharing) → 201 `{playlist}`                                    |

## Friends (`/friends`) & notifications (`/notifications`)

| Method | Path                                                  | Notes                                                                               |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/friends`                                            | `{items: [{user, since, online, watching: {roomCode, roomName, movieTitle, private} | null}]}`— presence hidden when the friend disabled`showOnlineStatus`; private rooms appear as `{private: true}` |
| GET    | `/friends/requests`                                   | `{incoming: [{id, user, createdAt}], outgoing: [...]}`                              |
| POST   | `/friends/requests`                                   | `{username}` → 201 `{status: 'PENDING'                                              | 'ACCEPTED'}` (crossing requests auto-accept)                                                                    |
| POST   | `/friends/requests/:id/accept` · `/decline`           | recipient → 204                                                                     |
| DELETE | `/friends/requests/:id`                               | sender cancels → 204                                                                |
| DELETE | `/friends/:userId`                                    | unfriend → 204                                                                      |
| GET    | `/notifications?page`                                 | paginated `NotificationDto` + `unreadCount`                                         |
| GET    | `/notifications/unread-count`                         | `{unreadCount}`                                                                     |
| POST   | `/notifications/:id/read` · `/notifications/read-all` | 204                                                                                 |
| DELETE | `/notifications/:id`                                  | 204                                                                                 |

Live notifications arrive on the socket as `notification` events (every connected socket joins
its user channel automatically).
