import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppConfig } from '../src/config/app-config';
import { friendshipKey } from '../src/users/friendship.query';
import { ids, seedTestCatalog } from './catalog-fixtures';
import {
  createGuest,
  createTestApp,
  registerUser,
  resetState,
  type TestApp,
  type TestUser,
} from './helpers';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(
    '0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
    'hex',
  ),
]);
const GIF = Buffer.from('474946383961010001000000002c00000000010001000002', 'hex');

describe('profiles & users (integration)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
    await seedTestCatalog(t);
  });

  const befriend = (a: TestUser, b: TestUser) =>
    t.prisma.friendship.create({ data: friendshipKey(a.id, b.id) });

  it('updates display name, bio, merged preferences and privacy', async () => {
    const u = await registerUser(t);
    const first = await u.agent
      .patch('/api/v1/profiles/me')
      .send({
        displayName: ' Ann ',
        bio: 'Film nerd',
        preferences: { captionsByDefault: true },
        privacy: { watchHistoryVisibility: 'FRIENDS' },
      })
      .expect(200);
    expect(first.body.user).toMatchObject({
      displayName: 'Ann',
      bio: 'Film nerd',
      preferences: {
        autoplayNext: true,
        captionsByDefault: true,
        defaultVolume: 0.8,
        reduceMotion: false,
        browserNotifications: false,
      },
      privacy: {
        profileVisibility: 'PUBLIC',
        watchHistoryVisibility: 'FRIENDS',
        showOnlineStatus: true,
        discoverable: true,
      },
    });
    const second = await u.agent
      .patch('/api/v1/profiles/me')
      .send({ preferences: { defaultVolume: 0.3 }, bio: '' })
      .expect(200);
    expect(second.body.user.preferences).toMatchObject({
      captionsByDefault: true,
      defaultVolume: 0.3,
    });
    expect(second.body.user.bio).toBeNull();
    await u.agent
      .patch('/api/v1/profiles/me')
      .send({ preferences: { defaultVolume: 5 } })
      .expect(400);
    await u.agent
      .patch('/api/v1/profiles/me')
      .send({ privacy: { profileVisibility: 'EVERYONE' } })
      .expect(400);
    const guest = await createGuest(t);
    await guest.agent.patch('/api/v1/profiles/me').send({ bio: 'x' }).expect(403);
  });

  it('uploads avatars with magic-byte checks, replaces and deletes the old file', async () => {
    const u = await registerUser(t);
    const svg = await u.agent
      .post('/api/v1/profiles/me/avatar')
      .attach(
        'file',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        {
          filename: 'evil.png',
          contentType: 'image/png',
        },
      )
      .expect(415);
    expect(svg.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    await u.agent.post('/api/v1/profiles/me/avatar').expect(400);
    const big = await u.agent
      .post('/api/v1/profiles/me/avatar')
      .attach('file', Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), {
        filename: 'big.png',
        contentType: 'image/png',
      });
    expect(big.status).toBe(413);

    const up = await u.agent
      .post('/api/v1/profiles/me/avatar')
      .attach('file', PNG, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(up.body.avatarUrl).toMatch(
      new RegExp(`^/api/v1/profiles/avatars/${u.id}-[A-Za-z0-9_-]+\\.png$`),
    );
    const img = await http().get(up.body.avatarUrl).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(img.body as Buffer, PNG)).toBe(0);
    const firstKey = (await t.prisma.userProfile.findUniqueOrThrow({ where: { userId: u.id } }))
      .avatarKey!;
    const storageDir = t.app.get(AppConfig).storageDir;
    expect(existsSync(resolve(storageDir, firstKey))).toBe(true);

    const second = await u.agent
      .post('/api/v1/profiles/me/avatar')
      .attach('file', GIF, { filename: 'b.gif', contentType: 'image/gif' })
      .expect(200);
    expect(second.body.avatarUrl).toMatch(/\.gif$/);
    expect(existsSync(resolve(storageDir, firstKey))).toBe(false);
    await http().get(up.body.avatarUrl).expect(404);
    expect((await u.agent.get('/api/v1/auth/me').expect(200)).body.user.avatarUrl).toBe(
      second.body.avatarUrl,
    );

    await u.agent.delete('/api/v1/profiles/me/avatar').expect(204);
    await http().get(second.body.avatarUrl).expect(404);
    expect((await u.agent.get('/api/v1/auth/me').expect(200)).body.user.avatarUrl).toBeNull();
    await http().get('/api/v1/profiles/avatars/..%2F..%2Fsecret.png').expect(404);
  });

  it('respects profile and watch-history visibility', async () => {
    const owner = await registerUser(t);
    const friend = await registerUser(t);
    const stranger = await registerUser(t);
    await befriend(owner, friend);
    await owner.agent.put(`/api/v1/favorites/${ids.nosferatu}`).expect(204);
    await owner.agent
      .put('/api/v1/history/progress')
      .send({ movieId: ids.neonDrift, positionSec: 50, durationSec: 120 })
      .expect(204);

    // Defaults: PUBLIC profile, PRIVATE history.
    const anon = await http().get(`/api/v1/profiles/${owner.username}`).expect(200);
    expect(anon.body.profile).toMatchObject({
      id: owner.id,
      username: owner.username,
      bio: null,
      friendship: 'none',
      stats: { favorites: 1, playlists: 0 },
      createdAt: expect.any(String),
    });
    expect(anon.body.favorites.map((m: { id: string }) => m.id)).toEqual([ids.nosferatu]);
    expect(anon.body.history).toBeUndefined();
    const self = await owner.agent.get(`/api/v1/profiles/${owner.username}`).expect(200);
    expect(self.body.profile.friendship).toBe('self');
    expect(self.body.history[0]).toMatchObject({ movie: { id: ids.neonDrift }, positionSec: 50 });

    await owner.agent
      .patch('/api/v1/profiles/me')
      .send({ privacy: { profileVisibility: 'FRIENDS', watchHistoryVisibility: 'FRIENDS' } })
      .expect(200);
    const blocked = await stranger.agent.get(`/api/v1/profiles/${owner.username}`).expect(403);
    expect(blocked.body.error.code).toBe('PROFILE_PRIVATE');
    expect(JSON.stringify(blocked.body)).not.toContain('Nosferatu');
    await http().get(`/api/v1/profiles/${owner.username}`).expect(403);
    const asFriend = await friend.agent.get(`/api/v1/profiles/${owner.username}`).expect(200);
    expect(asFriend.body.profile.friendship).toBe('friends');
    expect(asFriend.body.history).toHaveLength(1);

    await owner.agent
      .patch('/api/v1/profiles/me')
      .send({ privacy: { profileVisibility: 'PRIVATE' } })
      .expect(200);
    await friend.agent.get(`/api/v1/profiles/${owner.username}`).expect(403);
    await owner.agent.get(`/api/v1/profiles/${owner.username}`).expect(200);

    const guest = await createGuest(t);
    const guestUser = await t.prisma.user.findUniqueOrThrow({ where: { id: guest.id } });
    await http().get(`/api/v1/profiles/${guestUser.username}`).expect(404);
    await http().get('/api/v1/profiles/nobody_here').expect(404);
  });

  it('searches discoverable, non-guest users with friendship status', async () => {
    const me = await registerUser(t, { username: 'searcher' });
    const friend = await registerUser(t, { username: 'film_friend' });
    const pending = await registerUser(t, { username: 'film_pending' });
    const hidden = await registerUser(t, { username: 'film_hidden' });
    await createGuest(t, 'film guest');
    await befriend(me, friend);
    await t.prisma.friendRequest.create({ data: { fromId: pending.id, toId: me.id } });
    await hidden.agent
      .patch('/api/v1/profiles/me')
      .send({ privacy: { discoverable: false } })
      .expect(200);

    const res = await me.agent.get('/api/v1/users/search?q=FILM').expect(200);
    expect(res.body.items).toEqual([
      {
        id: friend.id,
        username: 'film_friend',
        displayName: 'film_friend',
        avatarUrl: null,
        isGuest: false,
        friendship: 'friends',
      },
      {
        id: pending.id,
        username: 'film_pending',
        displayName: 'film_pending',
        avatarUrl: null,
        isGuest: false,
        friendship: 'incoming',
      },
    ]);
    const outgoing = await pending.agent.get('/api/v1/users/search?q=search').expect(200);
    expect(outgoing.body.items).toEqual([
      expect.objectContaining({ id: me.id, friendship: 'outgoing' }),
    ]);
    await me.agent.get('/api/v1/users/search?q=a').expect(400);
    await http().get('/api/v1/users/search?q=film').expect(401);
    // ILIKE wildcards are matched literally.
    expect((await me.agent.get('/api/v1/users/search?q=%25%25').expect(200)).body.items).toEqual(
      [],
    );
  });
});
