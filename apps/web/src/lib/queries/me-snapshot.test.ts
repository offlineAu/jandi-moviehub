import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { Me } from '../types';
import { qk } from './keys';
import { readMeSnapshot, syncMeSnapshot, writeMeSnapshot } from './me-snapshot';

const me = { id: 'u1', username: 'ana', displayName: 'Ana', isGuest: false } as Me;

afterEach(() => window.localStorage.clear());

describe('me snapshot', () => {
  it('round-trips a user and clears on null', () => {
    writeMeSnapshot(me);
    expect(readMeSnapshot()).toEqual(me);
    writeMeSnapshot(null);
    expect(readMeSnapshot()).toBeUndefined();
  });

  it('ignores malformed storage', () => {
    window.localStorage.setItem('jandi:me-snapshot:v1', '{not json');
    expect(readMeSnapshot()).toBeUndefined();
    window.localStorage.setItem('jandi:me-snapshot:v1', JSON.stringify({ id: 1 }));
    expect(readMeSnapshot()).toBeUndefined();
  });

  it('mirrors the me query: sign-in stores, sign-out clears, other queries ignored', () => {
    const client = new QueryClient();
    const unsubscribe = syncMeSnapshot(client);
    client.setQueryData(['profiles', 'ana'], { id: 'other' });
    expect(readMeSnapshot()).toBeUndefined();
    client.setQueryData(qk.me, me);
    expect(readMeSnapshot()).toEqual(me);
    client.clear(); // login/logout clear the cache first — must not wipe on removal alone
    expect(readMeSnapshot()).toEqual(me);
    client.setQueryData(qk.me, null);
    expect(readMeSnapshot()).toBeUndefined();
    unsubscribe();
  });
});
