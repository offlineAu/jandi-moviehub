import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HistoryService } from '../src/library/history.service';
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

describe('library (integration)', () => {
  let t: TestApp;
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

  it('manages favorites idempotently with paginated summaries', async () => {
    const u = await registerUser(t);
    await u.agent.put(`/api/v1/favorites/${ids.bunny}`).expect(204);
    await u.agent.put(`/api/v1/favorites/${ids.bunny}`).expect(204);
    await u.agent.put(`/api/v1/favorites/${ids.neonDrift}`).expect(204);
    await u.agent.put('/api/v1/favorites/00000000-0000-4000-8000-000000000000').expect(404);
    const list = await u.agent.get('/api/v1/favorites?pageSize=1').expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(list.body.items[0]).toEqual({
      movie: expect.objectContaining({ id: ids.neonDrift }),
      createdAt: expect.any(String),
    });
    await u.agent.delete(`/api/v1/favorites/${ids.bunny}`).expect(204);
    expect((await u.agent.get('/api/v1/favorites').expect(200)).body.total).toBe(1);

    const other = await registerUser(t);
    expect((await other.agent.get('/api/v1/favorites').expect(200)).body.total).toBe(0);
  });

  it('rejects guests and anonymous callers', async () => {
    const guest = await createGuest(t);
    await guest.agent.get('/api/v1/favorites').expect(403);
    await guest.agent.get('/api/v1/watchlists').expect(403);
    const { default: request } = await import('supertest');
    await request(t.app.getHttpServer()).get('/api/v1/history').expect(401);
  });

  it('creates, renames and deletes watchlists; the default list is protected', async () => {
    const u = await registerUser(t);
    const lists = await u.agent.get('/api/v1/watchlists').expect(200);
    expect(lists.body.items).toHaveLength(1);
    const def = lists.body.items[0];
    expect(def).toMatchObject({
      name: 'My Watchlist',
      isDefault: true,
      isGroup: false,
      itemCount: 0,
      members: [],
      previewPosters: [],
    });
    expect(def.owner).toEqual({
      id: u.id,
      username: u.username,
      displayName: u.username,
      avatarUrl: null,
      isGuest: false,
    });
    await u.agent.delete(`/api/v1/watchlists/${def.id}`).expect(409);

    const created = await u.agent
      .post('/api/v1/watchlists')
      .send({ name: '  Spooky season ', description: 'Halloween' })
      .expect(201);
    const wl = created.body.watchlist;
    expect(wl).toMatchObject({ name: 'Spooky season', description: 'Halloween', isDefault: false });
    await u.agent.post('/api/v1/watchlists').send({ name: '' }).expect(400);

    const renamed = await u.agent
      .patch(`/api/v1/watchlists/${wl.id}`)
      .send({ name: 'Frights' })
      .expect(200);
    expect(renamed.body.watchlist.name).toBe('Frights');
    await u.agent.patch(`/api/v1/watchlists/${wl.id}`).send({}).expect(400);

    await u.agent
      .post(`/api/v1/watchlists/${wl.id}/items`)
      .send({ movieId: ids.nosferatu })
      .expect(201);
    const dup = await u.agent
      .post(`/api/v1/watchlists/${wl.id}/items`)
      .send({ movieId: ids.nosferatu })
      .expect(409);
    expect(dup.body.error.code).toBe('ALREADY_IN_WATCHLIST');
    await u.agent
      .post(`/api/v1/watchlists/${wl.id}/items`)
      .send({ movieId: ids.notld })
      .expect(201);
    const detail = await u.agent.get(`/api/v1/watchlists/${wl.id}`).expect(200);
    expect(detail.body.watchlist).toMatchObject({
      itemCount: 2,
      previewPosters: expect.arrayContaining([expect.stringMatching(/poster\.svg$/)]),
    });
    expect(detail.body.items[0]).toMatchObject({
      id: expect.any(String),
      movie: { id: ids.notld },
      addedBy: { id: u.id },
      createdAt: expect.any(String),
    });
    await u.agent.delete(`/api/v1/watchlists/${wl.id}/items/${ids.notld}`).expect(204);
    expect((await u.agent.get(`/api/v1/watchlists/${wl.id}`).expect(200)).body.items).toHaveLength(
      1,
    );

    await u.agent.delete(`/api/v1/watchlists/${wl.id}`).expect(204);
    await u.agent.get(`/api/v1/watchlists/${wl.id}`).expect(404);
  });

  it("never lets users read or modify someone else's watchlist", async () => {
    const owner = await registerUser(t);
    const intruder = await registerUser(t);
    const wl = (await owner.agent.post('/api/v1/watchlists').send({ name: 'Private' }).expect(201))
      .body.watchlist;
    await intruder.agent.get(`/api/v1/watchlists/${wl.id}`).expect(404);
    await intruder.agent.patch(`/api/v1/watchlists/${wl.id}`).send({ name: 'Hacked' }).expect(404);
    await intruder.agent.delete(`/api/v1/watchlists/${wl.id}`).expect(404);
    await intruder.agent
      .post(`/api/v1/watchlists/${wl.id}/items`)
      .send({ movieId: ids.bunny })
      .expect(404);
    await intruder.agent.delete(`/api/v1/watchlists/${wl.id}/items/${ids.bunny}`).expect(404);
    await intruder.agent
      .post(`/api/v1/watchlists/${wl.id}/members`)
      .send({ username: intruder.username })
      .expect(404);
    expect(
      (await intruder.agent.get('/api/v1/watchlists').expect(200)).body.items.map(
        (w: { id: string }) => w.id,
      ),
    ).not.toContain(wl.id);
    expect((await t.prisma.watchlist.findUniqueOrThrow({ where: { id: wl.id } })).name).toBe(
      'Private',
    );
  });

  it('group lists: only accepted friends can be added; members edit items; only owners manage the list', async () => {
    const owner = await registerUser(t);
    const friend = await registerUser(t);
    const stranger = await registerUser(t);
    await befriend(owner, friend);
    const wl = (
      await owner.agent.post('/api/v1/watchlists').send({ name: 'Movie club' }).expect(201)
    ).body.watchlist;

    const notFriend = await owner.agent
      .post(`/api/v1/watchlists/${wl.id}/members`)
      .send({ username: stranger.username })
      .expect(403);
    expect(notFriend.body.error.code).toBe('NOT_FRIENDS');
    // A pending request is not enough.
    await t.prisma.friendRequest.create({ data: { fromId: owner.id, toId: stranger.id } });
    await owner.agent
      .post(`/api/v1/watchlists/${wl.id}/members`)
      .send({ username: stranger.username })
      .expect(403);

    const added = await owner.agent
      .post(`/api/v1/watchlists/${wl.id}/members`)
      .send({ username: friend.username })
      .expect(201);
    expect(added.body.watchlist).toMatchObject({
      isGroup: true,
      members: [expect.objectContaining({ id: friend.id })],
    });
    await owner.agent
      .post(`/api/v1/watchlists/${wl.id}/members`)
      .send({ username: friend.username })
      .expect(409);

    // Member sees it and can add/remove items…
    expect(
      (await friend.agent.get('/api/v1/watchlists').expect(200)).body.items.map(
        (w: { id: string }) => w.id,
      ),
    ).toContain(wl.id);
    await friend.agent
      .post(`/api/v1/watchlists/${wl.id}/items`)
      .send({ movieId: ids.bunny })
      .expect(201);
    const items = (await owner.agent.get(`/api/v1/watchlists/${wl.id}`).expect(200)).body.items;
    expect(items[0].addedBy.id).toBe(friend.id);
    const lib = await friend.agent.get(`/api/v1/movies/${ids.bunny}/library-status`).expect(200);
    expect(lib.body.watchlistIds).toContain(wl.id);

    // …but cannot rename, delete or manage members.
    await friend.agent.patch(`/api/v1/watchlists/${wl.id}`).send({ name: 'Mine now' }).expect(403);
    await friend.agent.delete(`/api/v1/watchlists/${wl.id}`).expect(403);
    await friend.agent
      .post(`/api/v1/watchlists/${wl.id}/members`)
      .send({ username: owner.username })
      .expect(403);
    await friend.agent.delete(`/api/v1/watchlists/${wl.id}/members/${owner.id}`).expect(403);

    // A member can leave; the list stops being a group list.
    await friend.agent.delete(`/api/v1/watchlists/${wl.id}/members/${friend.id}`).expect(204);
    await friend.agent.get(`/api/v1/watchlists/${wl.id}`).expect(404);
    expect(
      (await owner.agent.get(`/api/v1/watchlists/${wl.id}`).expect(200)).body.watchlist.isGroup,
    ).toBe(false);

    // Owner can remove members.
    await owner.agent
      .post(`/api/v1/watchlists/${wl.id}/members`)
      .send({ username: friend.username })
      .expect(201);
    await owner.agent.delete(`/api/v1/watchlists/${wl.id}/members/${friend.id}`).expect(204);
    await owner.agent.delete(`/api/v1/watchlists/${wl.id}/members/${friend.id}`).expect(404);
  });

  it('tracks progress, completion, continue-watching and history deletion', async () => {
    const u = await registerUser(t);
    await u.agent
      .put('/api/v1/history/progress')
      .send({ movieId: ids.neonDrift, positionSec: 45, durationSec: 120 })
      .expect(204);
    await u.agent
      .put('/api/v1/history/progress')
      .send({ movieId: ids.sunrise, positionSec: 10 })
      .expect(204);
    await u.agent
      .put('/api/v1/history/progress')
      .send({ movieId: ids.courier, positionSec: 58, durationSec: 60 })
      .expect(204);
    await u.agent
      .put('/api/v1/history/progress')
      .send({ movieId: ids.neonDrift, positionSec: -1 })
      .expect(400);
    await u.agent
      .put('/api/v1/history/progress')
      .send({ movieId: 'nope', positionSec: 1 })
      .expect(400);

    const cont = await u.agent.get('/api/v1/history/continue').expect(200);
    expect(cont.body.items).toHaveLength(1); // sunrise < 30 s, courier completed
    expect(cont.body.items[0]).toEqual({
      movie: expect.objectContaining({ id: ids.neonDrift }),
      positionSec: 45,
      durationSec: 120,
      completed: false,
      lastWatchedAt: expect.any(String),
    });
    const status = await u.agent.get(`/api/v1/movies/${ids.courier}/library-status`).expect(200);
    expect(status.body).toEqual({
      favorite: false,
      watchlistIds: [],
      progress: { positionSec: 58, durationSec: 60, completed: true },
    });
    // Without an explicit duration the catalog runtime is used (1 min for the 20 s short).
    expect(
      (await u.agent.get(`/api/v1/movies/${ids.sunrise}/library-status`).expect(200)).body.progress,
    ).toMatchObject({ durationSec: 60 });

    const hist = await u.agent.get('/api/v1/history?pageSize=2').expect(200);
    expect(hist.body).toMatchObject({ total: 3, totalPages: 2, page: 1, pageSize: 2 });
    expect(hist.body.items[0].movie.id).toBe(ids.courier);

    await u.agent.delete(`/api/v1/history/${ids.courier}`).expect(204);
    expect((await u.agent.get('/api/v1/history').expect(200)).body.total).toBe(2);
    await u.agent.delete('/api/v1/history').expect(204);
    expect((await u.agent.get('/api/v1/history').expect(200)).body.total).toBe(0);
  });

  it('HistoryService.recordProgress is usable by other modules', async () => {
    const u = await registerUser(t);
    const row = await t.app.get(HistoryService).recordProgress(u.id, ids.projectionist, 119, 120);
    expect(row).toMatchObject({ completed: true, positionSec: 119, durationSec: 120 });
    await expect(
      t.app.get(HistoryService).recordProgress(u.id, '00000000-0000-4000-8000-000000000000', 1),
    ).rejects.toThrow();
  });

  it('library-status reflects favorites and 404s unknown movies', async () => {
    const u = await registerUser(t);
    await u.agent.put(`/api/v1/favorites/${ids.nosferatu}`).expect(204);
    const def = (await u.agent.get('/api/v1/watchlists').expect(200)).body.items[0];
    await u.agent
      .post(`/api/v1/watchlists/${def.id}/items`)
      .send({ movieId: ids.nosferatu })
      .expect(201);
    const res = await u.agent.get(`/api/v1/movies/${ids.nosferatu}/library-status`).expect(200);
    expect(res.body).toEqual({ favorite: true, watchlistIds: [def.id], progress: null });
    await u.agent
      .get('/api/v1/movies/00000000-0000-4000-8000-000000000000/library-status')
      .expect(404);
  });
});
