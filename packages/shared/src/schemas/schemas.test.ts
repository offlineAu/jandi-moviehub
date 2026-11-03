import { describe, expect, it } from 'vitest';
import { cleanText, createRoomSchema, registerSchema, sendMessageSchema } from './index';

describe('schemas', () => {
  it('normalises registration input', () => {
    const parsed = registerSchema.parse({
      email: '  Alice@Example.COM ',
      username: 'Alice_01',
      displayName: ' Alice ',
      password: 'correct horse battery',
    });
    expect(parsed.email).toBe('alice@example.com');
    expect(parsed.username).toBe('alice_01');
    expect(parsed.displayName).toBe('Alice');
  });

  it('rejects weak passwords and bad usernames', () => {
    expect(
      registerSchema.safeParse({
        email: 'a@b.co',
        username: 'x',
        displayName: 'X',
        password: 'short',
      }).success,
    ).toBe(false);
  });

  it('requires a password for password rooms', () => {
    const r = createRoomSchema.safeParse({ name: 'Movie night', visibility: 'PASSWORD' });
    expect(r.success).toBe(false);
  });

  it('strips control characters from chat', () => {
    expect(cleanText('hi\u0000 there\u0007')).toBe('hi there');
    const r = sendMessageSchema.safeParse({
      roomId: '123e4567-e89b-42d3-a456-426614174000',
      body: '\u0000\u0001  ',
    });
    expect(r.success).toBe(false);
  });
});

describe('partial update schemas', () => {
  it('do not inject defaults for omitted fields', async () => {
    const { updateRoomSchema, updatePlaylistSchema } = await import('./index');
    expect(updateRoomSchema.parse({ name: 'Renamed room' })).toEqual({ name: 'Renamed room' });
    expect(updatePlaylistSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
    const { updateProfileSchema } = await import('./index');
    expect(updateProfileSchema.parse({ preferences: { reduceMotion: true } })).toEqual({
      preferences: { reduceMotion: true },
    });
  });
});
