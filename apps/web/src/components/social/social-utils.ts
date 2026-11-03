import { isApiError } from '@/lib/api';
import type { Friend, FriendRequests } from '@/lib/queries/social';
import type { Friendship, PublicUser } from '@/lib/types';

export type PresenceKind = 'watching' | 'private-room' | 'online' | 'offline';

export interface Presence {
  kind: PresenceKind;
  /** Human text, e.g. "Watching Big Buck Bunny in Friday Night". */
  text: string;
  /** `/rooms/<code>` when the friend is in a room the viewer may join. */
  joinHref: string | null;
}

export function describePresence(friend: Pick<Friend, 'online' | 'watching'>): Presence {
  const w = friend.watching;
  if (w) {
    if (w.private || !w.roomCode) {
      return { kind: 'private-room', text: 'In a private room', joinHref: null };
    }
    const room = w.roomName?.trim() || 'a watch party';
    const text = w.movieTitle ? `Watching ${w.movieTitle} in ${room}` : `In ${room}`;
    return { kind: 'watching', text, joinHref: `/rooms/${encodeURIComponent(w.roomCode)}` };
  }
  return friend.online
    ? { kind: 'online', text: 'Online', joinHref: null }
    : { kind: 'offline', text: 'Offline', joinHref: null };
}

/** Pending request id between the viewer and `userId` for the given direction, if any. */
export function findRequestId(
  requests: FriendRequests | undefined,
  userId: string,
  direction: 'incoming' | 'outgoing',
): string | null {
  return requests?.[direction].find((r) => r.user.id === userId)?.id ?? null;
}

export type FriendAction = 'add' | 'cancel' | 'accept' | 'remove' | null;

/** Primary action offered for a friendship status ("incoming" also offers decline). */
export function primaryFriendAction(status: Friendship): FriendAction {
  switch (status) {
    case 'none':
      return 'add';
    case 'outgoing':
      return 'cancel';
    case 'incoming':
      return 'accept';
    case 'friends':
      return 'remove';
    default:
      return null;
  }
}

export const FRIENDSHIP_STATUS_TEXT: Record<Friendship, string> = {
  self: 'You',
  friends: 'Friends',
  outgoing: 'Request sent',
  incoming: 'Wants to be friends',
  none: '',
};

/**
 * `GET /profiles/:username` answers hidden profiles with 403 `PROFILE_PRIVATE` and
 * `details.profile` (identity + friendship) so the viewer can still send a request.
 */
export function privateProfileIdentity(
  error: unknown,
): (PublicUser & { friendship: Friendship }) | null {
  if (!isApiError(error) || error.code !== 'PROFILE_PRIVATE') return null;
  const profile = (error.details as { profile?: unknown } | null | undefined)?.profile;
  if (!profile || typeof profile !== 'object') return null;
  const p = profile as Partial<PublicUser & { friendship: Friendship }>;
  if (typeof p.id !== 'string' || typeof p.username !== 'string') return null;
  return {
    id: p.id,
    username: p.username,
    displayName: typeof p.displayName === 'string' ? p.displayName : p.username,
    avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : null,
    isGuest: false,
    friendship: p.friendship ?? 'none',
  };
}
