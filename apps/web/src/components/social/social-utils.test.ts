import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import type { FriendRequests } from '@/lib/queries/social';
import {
  describePresence,
  findRequestId,
  primaryFriendAction,
  privateProfileIdentity,
} from './social-utils';

describe('describePresence', () => {
  it('describes a shareable room with a join link', () => {
    expect(
      describePresence({
        online: true,
        watching: {
          roomCode: 'ABCD2345',
          roomName: 'Friday',
          movieTitle: 'Sintel',
          private: false,
        },
      }),
    ).toEqual({ kind: 'watching', text: 'Watching Sintel in Friday', joinHref: '/rooms/ABCD2345' });
  });
  it('falls back when the room has no movie or name', () => {
    expect(
      describePresence({
        online: true,
        watching: { roomCode: 'ABCD2345', roomName: ' ', movieTitle: null, private: false },
      }).text,
    ).toBe('In a watch party');
  });
  it('hides private room details', () => {
    expect(
      describePresence({
        online: true,
        watching: { roomCode: null, roomName: null, movieTitle: null, private: true },
      }),
    ).toEqual({ kind: 'private-room', text: 'In a private room', joinHref: null });
  });
  it('reports online/offline', () => {
    expect(describePresence({ online: true, watching: null }).kind).toBe('online');
    expect(describePresence({ online: false, watching: null }).text).toBe('Offline');
  });
});

describe('friend request helpers', () => {
  const user = (id: string) => ({
    id,
    username: id,
    displayName: id,
    avatarUrl: null,
    isGuest: false,
  });
  const requests: FriendRequests = {
    incoming: [{ id: 'r1', user: user('a'), createdAt: '' }],
    outgoing: [{ id: 'r2', user: user('b'), createdAt: '' }],
  };
  it('finds the pending request per direction', () => {
    expect(findRequestId(requests, 'a', 'incoming')).toBe('r1');
    expect(findRequestId(requests, 'a', 'outgoing')).toBeNull();
    expect(findRequestId(requests, 'b', 'outgoing')).toBe('r2');
    expect(findRequestId(undefined, 'b', 'outgoing')).toBeNull();
  });
  it('maps friendship statuses to actions', () => {
    expect(primaryFriendAction('none')).toBe('add');
    expect(primaryFriendAction('outgoing')).toBe('cancel');
    expect(primaryFriendAction('incoming')).toBe('accept');
    expect(primaryFriendAction('friends')).toBe('remove');
    expect(primaryFriendAction('self')).toBeNull();
  });
});

describe('privateProfileIdentity', () => {
  it('reads the identity from a PROFILE_PRIVATE error', () => {
    const error = new ApiError({
      status: 403,
      code: 'PROFILE_PRIVATE',
      message: 'This profile is private',
      details: {
        profile: {
          id: 'u1',
          username: 'ana',
          displayName: 'Ana',
          avatarUrl: null,
          friendship: 'incoming',
        },
      },
    });
    expect(privateProfileIdentity(error)).toEqual({
      id: 'u1',
      username: 'ana',
      displayName: 'Ana',
      avatarUrl: null,
      isGuest: false,
      friendship: 'incoming',
    });
  });
  it('ignores other errors and malformed details', () => {
    expect(privateProfileIdentity(new Error('x'))).toBeNull();
    expect(
      privateProfileIdentity(new ApiError({ status: 403, code: 'FORBIDDEN', message: '' })),
    ).toBeNull();
    expect(
      privateProfileIdentity(
        new ApiError({
          status: 403,
          code: 'PROFILE_PRIVATE',
          message: '',
          details: { profile: 1 },
        }),
      ),
    ).toBeNull();
  });
});
