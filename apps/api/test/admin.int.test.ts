import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StorageService } from '../src/storage/storage.service';
import {
  createGuest,
  createTestApp,
  ORIGIN,
  registerUser,
  resetState,
  type TestApp,
} from './helpers';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
const id = randomUUID();

/** One representative route per admin family (plus every admin-only mutation). */
const ADMIN_ONLY: Array<[Method, string]> = [
  ['get', '/api/v1/admin/overview'],
  ['get', '/api/v1/admin/analytics'],
  ['get', '/api/v1/admin/sync-stats'],
  ['get', '/api/v1/admin/users'],
  ['patch', `/api/v1/admin/users/${id}`],
  ['get', '/api/v1/admin/movies'],
  ['post', '/api/v1/admin/movies'],
  ['patch', `/api/v1/admin/movies/${id}`],
  ['delete', `/api/v1/admin/movies/${id}`],
  ['get', '/api/v1/admin/licenses'],
  ['post', '/api/v1/admin/licenses'],
  ['patch', `/api/v1/admin/licenses/${id}`],
  ['post', `/api/v1/admin/licenses/${id}/verify`],
  ['post', `/api/v1/admin/licenses/${id}/unverify`],
  ['get', '/api/v1/admin/media'],
  ['post', '/api/v1/admin/media'],
  ['post', '/api/v1/admin/media/upload'],
  ['patch', `/api/v1/admin/media/${id}/status`],
  ['get', '/api/v1/admin/settings'],
  ['put', '/api/v1/admin/settings/site.announcement'],
];
const MODERATOR_OK: Array<[Method, string]> = [
  ['get', '/api/v1/admin/rooms'],
  ['post', `/api/v1/admin/rooms/${id}/close`],
  ['delete', `/api/v1/admin/messages/${id}`],
  ['get', '/api/v1/admin/reports'],
  ['patch', `/api/v1/admin/reports/${id}`],
  ['get', '/api/v1/admin/audit'],
];

const WEBM_HEADER = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
]);

describe('admin API (integration)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
  });

  const audits = (action: string) =>
    t.prisma.auditLog.findMany({ where: { action }, orderBy: { createdAt: 'asc' } });

  it('rejects USERs and guests with 403 on every admin route family, and anonymous with 401', async () => {
    const user = await registerUser(t);
    const guest = await createGuest(t);
    for (const [method, path] of [...ADMIN_ONLY, ...MODERATOR_OK]) {
      const res = await user.agent[method](path).send({});
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
      const g = await guest.agent[method](path).send({});
      expect(g.status, `guest ${method.toUpperCase()} ${path}`).toBe(403);
    }
    await request(t.app.getHttpServer()).get('/api/v1/admin/overview').expect(401);
  });

  it('lets MODERATORs use reports, rooms, messages and audit but not admin-only routes', async () => {
    const mod = await registerUser(t, { role: 'MODERATOR' });
    for (const [method, path] of ADMIN_ONLY) {
      const res = await mod.agent[method](path).send({});
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
    }
    await mod.agent.get('/api/v1/admin/reports').expect(200);
    await mod.agent.get('/api/v1/admin/rooms').expect(200);
    await mod.agent.get('/api/v1/admin/audit').expect(200);
    // Mutations reach the handler (404 for an unknown id rather than 403).
    await mod.agent.post(`/api/v1/admin/rooms/${id}/close`).expect(404);
    await mod.agent.delete(`/api/v1/admin/messages/${id}`).expect(404);
  });

  it('returns real overview counts', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    await registerUser(t);
    await createGuest(t);
    await admin.agent
      .post('/api/v1/rooms')
      .send({ name: 'Movie night', visibility: 'PRIVATE' })
      .expect(201);
    const res = await admin.agent.get('/api/v1/admin/overview').expect(200);
    expect(res.body.users).toMatchObject({ total: 3, guests: 1, registered: 2, newLast7d: 2 });
    expect(res.body.rooms).toMatchObject({ open: 1, createdLast7d: 1, recentlyActiveRooms: 1 });
    expect(res.body.mediaAssets).toEqual({ PENDING: 0, APPROVED: 0, REJECTED: 0, DISABLED: 0 });
    expect(res.body.reports.open).toBe(0);
    expect(res.body.sync).toHaveProperty('samples');
  });

  it('returns zero-filled analytics series of the requested length', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    await registerUser(t);
    const res = await admin.agent.get('/api/v1/admin/analytics?days=14').expect(200);
    const { series } = res.body;
    for (const key of ['signups', 'roomsCreated', 'messages', 'watchHistoryUpdates']) {
      expect(series[key]).toHaveLength(14);
    }
    const today = new Date().toISOString().slice(0, 10);
    expect(res.body.to).toBe(today);
    expect(series.signups.at(-1)).toEqual({ date: today, count: 2 });
    expect(series.signups.slice(0, 13).every((p: { count: number }) => p.count === 0)).toBe(true);
    // Consecutive days, oldest first.
    const dates = series.signups.map((p: { date: string }) => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(14);
    expect(Array.isArray(res.body.topMovies)).toBe(true);
    await admin.agent.get('/api/v1/admin/analytics?days=0').expect(400);
    const def = await admin.agent.get('/api/v1/admin/analytics').expect(200);
    expect(def.body.series.messages).toHaveLength(30);
  });

  it('suspends a user (revoking sessions, audited) and unsuspends them', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const victim = await registerUser(t);
    await victim.agent.get('/api/v1/auth/me').expect(200);
    const res = await admin.agent
      .patch(`/api/v1/admin/users/${victim.id}`)
      .send({ suspended: true })
      .expect(200);
    expect(res.body.user).toMatchObject({ id: victim.id, suspended: true });
    expect(await t.prisma.session.count({ where: { userId: victim.id } })).toBe(0);
    await victim.agent.get('/api/v1/auth/me').expect(401);
    const [entry] = await audits('admin.user.update');
    expect(entry).toMatchObject({ actorId: admin.id, targetType: 'user', targetId: victim.id });
    expect(entry!.metadata).toMatchObject({
      changes: { suspended: { from: false, to: true } },
      sessionsRevoked: 1,
    });
    expect(entry!.ip).toBeTruthy();
    await admin.agent
      .patch(`/api/v1/admin/users/${victim.id}`)
      .send({ suspended: false, role: 'MODERATOR' })
      .expect(200);
    const list = await admin.agent.get(`/api/v1/admin/users?role=MODERATOR`).expect(200);
    expect(list.body.items.map((u: { id: string }) => u.id)).toEqual([victim.id]);
    expect(list.body.items[0]).toMatchObject({ suspended: false, role: 'MODERATOR' });
    expect(await audits('admin.user.update')).toHaveLength(2);
    // Search
    const search = await admin.agent.get(`/api/v1/admin/users?q=${victim.username}`).expect(200);
    expect(search.body.total).toBe(1);
  });

  it('protects the last admin and forbids self demotion/suspension', async () => {
    const a = await registerUser(t, { role: 'ADMIN' });
    let res = await a.agent.patch(`/api/v1/admin/users/${a.id}`).send({ role: 'USER' }).expect(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
    res = await a.agent.patch(`/api/v1/admin/users/${a.id}`).send({ suspended: true }).expect(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');

    const b = await registerUser(t, { role: 'ADMIN' });
    res = await a.agent.patch(`/api/v1/admin/users/${a.id}`).send({ suspended: true }).expect(403);
    expect(res.body.error.code).toBe('SELF_MODIFICATION');
    await a.agent.patch(`/api/v1/admin/users/${b.id}`).send({ role: 'USER' }).expect(200);
    res = await a.agent
      .patch(`/api/v1/admin/users/${a.id}`)
      .send({ role: 'MODERATOR' })
      .expect(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: a.id } })).role).toBe('ADMIN');
    await a.agent.patch(`/api/v1/admin/users/${randomUUID()}`).send({ role: 'USER' }).expect(404);
  });

  it('manages movies with upserted genres and audits each change', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const created = await admin.agent
      .post('/api/v1/admin/movies')
      .send({
        title: 'Night Train',
        genres: ['Mystery', 'mystery', 'Noir'],
        releaseDate: '1950-04-01',
        runtimeMin: 90,
      })
      .expect(201);
    const movie = created.body.movie;
    expect(movie).toMatchObject({
      title: 'Night Train',
      source: 'LOCAL',
      genres: ['Mystery', 'Noir'],
      playable: false,
      releaseDate: '1950-04-01',
    });
    expect(await t.prisma.genre.count()).toBe(2);
    const patched = await admin.agent
      .patch(`/api/v1/admin/movies/${movie.id}`)
      .send({ genres: ['Noir'], runtimeMin: null })
      .expect(200);
    expect(patched.body.movie).toMatchObject({
      title: 'Night Train',
      genres: ['Noir'],
      runtimeMin: null,
      isDemo: false,
    });
    const listed = await admin.agent.get('/api/v1/admin/movies?q=night').expect(200);
    expect(listed.body.total).toBe(1);
    await admin.agent.post('/api/v1/admin/movies').send({ title: '' }).expect(400);
    await admin.agent.delete(`/api/v1/admin/movies/${movie.id}`).expect(204);
    await admin.agent.get(`/api/v1/movies/${movie.id}`).expect(404);
    for (const action of ['admin.movie.create', 'admin.movie.update', 'admin.movie.delete']) {
      expect(await audits(action), action).toHaveLength(1);
    }
  });

  it('rejects non-video uploads (415) and stores a WebM by magic bytes', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const bad = await admin.agent
      .post('/api/v1/admin/media/upload')
      .attach('file', Buffer.from('%PDF-1.7 not a video'), 'movie.webm')
      .expect(415);
    expect(bad.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    await admin.agent.post('/api/v1/admin/media/upload').expect(400);
    const ok = await admin.agent
      .post('/api/v1/admin/media/upload')
      .attach('file', WEBM_HEADER, 'clip.bin')
      .expect(201);
    expect(ok.body.upload).toMatchObject({
      format: 'WEBM',
      mimeType: 'video/webm',
      sizeBytes: WEBM_HEADER.length,
    });
    expect(ok.body.upload.storageKey).toMatch(/^uploads\/[0-9a-f-]{36}\.webm$/);
    const storage = t.app.get(StorageService);
    expect((await storage.stat(ok.body.upload.storageKey))?.size).toBe(WEBM_HEADER.length);
    expect(await audits('admin.media.upload')).toHaveLength(1);
    await storage.delete(ok.body.upload.storageKey);
  });

  it('refuses to approve media until the license is verified and in-window', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const storage = t.app.get(StorageService);
    const up = await admin.agent
      .post('/api/v1/admin/media/upload')
      .attach('file', WEBM_HEADER, 'a.webm')
      .expect(201);
    const key = up.body.upload.storageKey as string;
    try {
      const movie = (
        await admin.agent.post('/api/v1/admin/movies').send({ title: 'Licensed Film' }).expect(201)
      ).body.movie;
      const license = (
        await admin.agent
          .post('/api/v1/admin/licenses')
          .send({
            type: 'CREATIVE_COMMONS',
            title: 'CC BY 4.0',
            licensor: 'Blender Foundation',
            provenanceUrl: 'https://example.org/proof',
          })
          .expect(201)
      ).body.license;
      expect(license).toMatchObject({ verified: false, usable: false });

      // Missing file → refused; HLS needs index.m3u8 in the directory.
      const base = { movieId: movie.id, licenseId: license.id, mimeType: '', durationSec: 60 };
      let res = await admin.agent
        .post('/api/v1/admin/media')
        .send({ ...base, format: 'WEBM', storageKey: 'uploads/missing.webm' })
        .expect(400);
      expect(res.body.error.code).toBe('MEDIA_FILE_MISSING');
      res = await admin.agent
        .post('/api/v1/admin/media')
        .send({ ...base, format: 'HLS', storageKey: 'uploads' })
        .expect(400);
      expect(res.body.error.code).toBe('MEDIA_FILE_MISSING');

      const asset = (
        await admin.agent
          .post('/api/v1/admin/media')
          .send({ ...base, format: 'WEBM', storageKey: key })
          .expect(201)
      ).body.asset;
      expect(asset).toMatchObject({
        status: 'PENDING',
        mimeType: 'video/webm',
        sizeBytes: WEBM_HEADER.length,
        playable: false,
      });

      res = await admin.agent
        .patch(`/api/v1/admin/media/${asset.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(409);
      expect(res.body.error.code).toBe('LICENSE_NOT_VERIFIED');

      const verified = await admin.agent
        .post(`/api/v1/admin/licenses/${license.id}/verify`)
        .expect(200);
      expect(verified.body.license).toMatchObject({
        verified: true,
        usable: true,
        verifiedBy: { id: admin.id },
      });

      // An expired window is still refused even when verified.
      await admin.agent
        .patch(`/api/v1/admin/licenses/${license.id}`)
        .send({ validUntil: '2020-01-01T00:00:00Z' })
        .expect(200);
      const reloaded = await t.prisma.contentLicense.findUniqueOrThrow({
        where: { id: license.id },
      });
      expect(reloaded.verifiedAt).toBeNull(); // material change clears verification
      await admin.agent.post(`/api/v1/admin/licenses/${license.id}/verify`).expect(200);
      res = await admin.agent
        .patch(`/api/v1/admin/media/${asset.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(409);
      expect(res.body.error.code).toBe('LICENSE_NOT_VERIFIED');
      await admin.agent
        .patch(`/api/v1/admin/licenses/${license.id}`)
        .send({ validUntil: null })
        .expect(200);
      await admin.agent.post(`/api/v1/admin/licenses/${license.id}/verify`).expect(200);

      const approved = await admin.agent
        .patch(`/api/v1/admin/media/${asset.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);
      expect(approved.body.asset).toMatchObject({
        status: 'APPROVED',
        playable: true,
        approvedBy: { id: admin.id },
      });
      const detail = await admin.agent.get(`/api/v1/movies/${movie.id}`).expect(200);
      expect(detail.body.movie.playable).toBe(true);
      const pending = await admin.agent.get('/api/v1/admin/media?status=APPROVED').expect(200);
      expect(pending.body.total).toBe(1);

      await admin.agent.post(`/api/v1/admin/licenses/${license.id}/unverify`).expect(200);
      expect(
        (await admin.agent.get(`/api/v1/movies/${movie.id}`).expect(200)).body.movie.playable,
      ).toBe(false);

      const statusAudits = await audits('admin.media.status');
      expect(statusAudits).toHaveLength(1);
      expect(statusAudits[0]!.metadata).toMatchObject({ from: 'PENDING', to: 'APPROVED' });
      expect(await audits('admin.license.verify')).toHaveLength(3);
      expect(await audits('admin.license.unverify')).toHaveLength(1);
      expect(await audits('admin.media.create')).toHaveLength(1);
      expect(await audits('admin.license.create')).toHaveLength(1);
    } finally {
      await storage.delete(key);
    }
  });

  it('validates settings per key and exposes only public settings', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const put = (key: string, value: unknown) =>
      admin.agent.put(`/api/v1/admin/settings/${key}`).send({ value });

    expect((await put('rooms.maxMembersDefault', 101)).status).toBe(400);
    expect((await put('rooms.maxMembersDefault', 1)).status).toBe(400);
    expect((await put('rooms.maxMembersDefault', 2.5)).status).toBe(400);
    expect((await put('rooms.maxMembersDefault', '10')).status).toBe(400);
    expect((await put('rooms.maxMembersDefault', 12)).status).toBe(200);
    expect((await put('chat.slowModeSec', 61)).status).toBe(400);
    expect((await put('chat.slowModeSec', 0)).status).toBe(200);
    expect((await put('registration.enabled', 'false')).status).toBe(400);
    expect((await put('registration.enabled', false)).status).toBe(200);
    expect((await put('site.announcement', 'x'.repeat(281))).status).toBe(400);
    expect((await put('site.announcement', 42)).status).toBe(400);
    expect((await put('site.announcement', '  Maintenance at 22:00 UTC  ')).status).toBe(200);
    let res = await put('Bad Key!', 1);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SETTING_KEY');
    res = await put('unknown.key', 1);
    expect(res.body.error.code).toBe('UNKNOWN_SETTING');
    // Keys resolve case-insensitively to their canonical spelling.
    expect((await put('rooms.maxmembersdefault', 12)).status).toBe(200);
    expect((await admin.agent.put('/api/v1/admin/settings/chat.slowModeSec').send({})).status).toBe(
      400,
    );

    const list = await admin.agent.get('/api/v1/admin/settings').expect(200);
    const byKey = Object.fromEntries(
      list.body.items.map((i: { key: string; value: unknown }) => [i.key, i.value]),
    );
    expect(byKey).toEqual({
      'site.announcement': 'Maintenance at 22:00 UTC',
      'rooms.maxMembersDefault': 12,
      'chat.slowModeSec': 0,
      'registration.enabled': false,
    });
    const pub = await request(t.app.getHttpServer()).get('/api/v1/settings/public').expect(200);
    expect(pub.body).toEqual({
      settings: { 'site.announcement': 'Maintenance at 22:00 UTC', 'registration.enabled': false },
    });

    const entries = await audits('admin.setting.update');
    expect(entries).toHaveLength(5);
    expect(entries.filter((e) => e.targetId === 'rooms.maxMembersDefault')).toHaveLength(2);
    expect(entries.find((e) => e.targetId === 'site.announcement')!.metadata).toMatchObject({
      key: 'site.announcement',
      from: null,
      to: 'Maintenance at 22:00 UTC',
    });
  });

  it('public settings fall back to defaults', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/settings/public').expect(200);
    expect(res.body).toEqual({
      settings: { 'site.announcement': '', 'registration.enabled': true },
    });
  });

  it('lets moderators list/close any room and delete messages, with audit rows', async () => {
    const mod = await registerUser(t, { role: 'MODERATOR' });
    const host = await registerUser(t);
    const room = (
      await host.agent
        .post('/api/v1/rooms')
        .send({ name: 'Secret club', visibility: 'PRIVATE' })
        .expect(201)
    ).body.room;
    const msg = (
      await host.agent
        .post(`/api/v1/rooms/${room.id}/messages`)
        .send({ body: 'spam spam' })
        .expect(201)
    ).body.message;

    const list = await mod.agent.get('/api/v1/admin/rooms?q=secret').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      id: room.id,
      visibility: 'PRIVATE',
      memberCount: 1,
      host: { id: host.id },
    });

    await mod.agent.delete(`/api/v1/admin/messages/${msg.id}`).expect(204);
    expect((await t.prisma.message.findUniqueOrThrow({ where: { id: msg.id } })).deletedById).toBe(
      mod.id,
    );
    await mod.agent.post(`/api/v1/admin/rooms/${room.id}/close`).expect(204);
    expect((await t.prisma.room.findUniqueOrThrow({ where: { id: room.id } })).status).toBe(
      'CLOSED',
    );
    const closed = await mod.agent.get('/api/v1/admin/rooms?status=CLOSED').expect(200);
    expect(closed.body.total).toBe(1);

    const audit = await mod.agent.get('/api/v1/admin/audit?action=admin').expect(200);
    const actions = audit.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(['admin.room.close', 'admin.message.delete']); // newest first
    expect(audit.body.items[0].actor).toMatchObject({ id: mod.id });
    const filtered = await mod.agent
      .get(`/api/v1/admin/audit?action=admin.message.delete&actorId=${mod.id}`)
      .expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].metadata).toMatchObject({ roomId: room.id, authorId: host.id });
  });

  it('uses the configured Origin guard for admin mutations', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    await request(t.app.getHttpServer())
      .put('/api/v1/admin/settings/chat.slowModeSec')
      .set('cookie', admin.cookie)
      .set('origin', 'https://evil.example')
      .send({ value: 5 })
      .expect(403);
    expect(ORIGIN).toBeTruthy();
  });
});
