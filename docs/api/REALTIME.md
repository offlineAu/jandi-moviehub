# Real-time protocol (Socket.IO)

Connect to the API origin (`NEXT_PUBLIC_WS_URL`, default `http://localhost:4000`) with
`withCredentials: true`. The handshake is authenticated with the `jandi_session` cookie and the
`Origin` must be an allowed web origin; otherwise the connection fails with `UNAUTHENTICATED`.
Event names and payload types: `packages/shared/src/sync/events.ts` (`SocketEvents`).

Every client→server event is acknowledged (`socket.emitWithAck`) with
`CommandAck = {ok: true, data, duplicate?} | {ok: false, error: {code, message}, state?}`.
Codes: `UNAUTHENTICATED FORBIDDEN NOT_IN_ROOM STALE INVALID NO_MEDIA RATE_LIMITED NOT_FOUND CONFLICT INTERNAL`.

## Joining

1. `POST /rooms/:id/join` (REST) creates the membership.
2. `room:join {roomId}` → ack `RoomSnapshot {room, playback, members, marathon, you: {userId, role, canControl}, serverTime}`.
3. On reconnect, emit `room:join` again; the snapshot is the source of truth.
4. `room:leave {roomId}` leaves the channel (not the membership).

## Clock synchronisation

`clock:ping {clientSentAt}` → `{clientSentAt, serverTime}`. Use `ClockSync` from `@jandi/shared`
(keeps the lowest-RTT half of the last 10 samples). Ping ~5× on join, then every 15 s.

## Playback

Authoritative state (`PlaybackState`): `{version, movieId, mediaAssetId, status, positionSec, rate,
anchorServerTime, durationSec, …}`. Position at server time T: `expectedPosition(state, T)`.

Commands (require `canControl`; envelope `{roomId, commandId (unique), baseVersion}`):

| Event            | Extra           | Effect                                                  |
| ---------------- | --------------- | ------------------------------------------------------- |
| `playback:play`  | `positionSec?`  | status → playing                                        |
| `playback:pause` | `positionSec?`  | status → paused                                         |
| `playback:seek`  | `positionSec`   | keeps status                                            |
| `playback:rate`  | `rate` (0.25–2) |                                                         |
| `movie:change`   | `movieId`       | loads the movie paused at 0 (blocked during a marathon) |

- `baseVersion` ≠ current version → `STALE` + `state` (resync, optionally retry once).
- Same `commandId` again → `{ok: true, duplicate: true}` (not re-applied).
- Rate limit 20 commands / 5 s per user per room.

Broadcasts: `playback:sync {state, serverTime}` after every change (including server-driven ones:
movie end, marathon loads), `movie:change {roomId, movieId, state}`.

Telemetry (any member):

- `playback:heartbeat {roomId, version, positionSec, driftSec, buffering, rttMs?}` every ~5 s
  (≤ 5 per 5 s). Drift = local − expected. Feeds drift statistics and watch history.
- `playback:buffering {roomId}` / `playback:recovered {roomId}`.
- `movie:end {roomId, version, positionSec}` — accepted only if the server agrees the movie is at
  its end (the server also detects the end itself with a timer).

## Presence & moderation

`member:presence {roomId, members: RoomMemberPresence[]}` (debounced), `host:transfer {fromUserId,
toUserId, reason: 'manual'|'left'|'disconnected'}`, `member:kicked {roomId, banned, reason}` (sent to
the removed user), `room:updated`, `room:closed {roomId, by}`.
If the host disconnects for longer than the grace period (60 s; `HOST_RECONNECT_GRACE_SEC`), host
passes to an online co-host, else the longest-standing online member.

## Chat & reactions

| Event            | Payload                                          | Ack data / broadcast                                                             |
| ---------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `chat:send`      | `{roomId, body (1–1000), replyToId?, clientId?}` | `ChatMessageDto`; broadcast `chat:message` (echoes `clientId` for optimistic UI) |
| `chat:delete`    | `{messageId}`                                    | broadcast `chat:deleted {roomId, messageId}`                                     |
| `chat:react`     | `{roomId, messageId, emoji}` (toggle)            | broadcast `chat:reactions {messageId, emoji, count, userId, added}`              |
| `reaction:burst` | `{roomId, emoji}`                                | broadcast `reaction:burst {emoji, userId, displayName, at}` (not stored)         |

Allowed emoji: `REACTION_EMOJI`. Limits: 5 messages / 5 s, 30 / min, the same text at most twice
per 30 s (`INVALID` "SPAM_DETECTED"), 20 reactions / 10 s, 10 bursts / 5 s. Bodies are plain text —
render them as text, never as HTML. System messages (`kind: 'SYSTEM'`, `author: null`) announce
joins/leaves, host changes and marathon events.

## Marathon

`marathon:state MarathonSnapshot | null` after every transition and vote;
`marathon:vote {roomId, playlistItemId}` (during `INTERMISSION`, voting enabled).

## Notifications

`notification NotificationDto` is pushed to all of a user's sockets.
