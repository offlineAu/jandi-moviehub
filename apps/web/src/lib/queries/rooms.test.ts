import { describe, expect, it } from 'vitest';
import { canControlFor, JOIN_ERROR_MESSAGES } from './rooms';

describe('canControlFor', () => {
  it('follows the room control policy', () => {
    expect(canControlFor('HOST_ONLY', 'HOST')).toBe(true);
    expect(canControlFor('HOST_ONLY', 'COHOST')).toBe(false);
    expect(canControlFor('HOSTS', 'COHOST')).toBe(true);
    expect(canControlFor('HOSTS', 'MEMBER')).toBe(false);
    expect(canControlFor('EVERYONE', 'MEMBER')).toBe(true);
    expect(canControlFor('EVERYONE', null)).toBe(false);
  });

  it('has a friendly message for every documented join error', () => {
    for (const code of [
      'BANNED',
      'ROOM_FULL',
      'WRONG_PASSWORD',
      'FRIENDS_ONLY',
      'INVITE_REQUIRED',
      'GUESTS_NOT_ALLOWED',
      'ROOM_CLOSED',
    ]) {
      expect(JOIN_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});
