import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createGuest,
  createTestApp,
  ORIGIN,
  registerUser,
  resetState,
  type TestApp,
} from './helpers';

describe('auth (integration)', () => {
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

  it('registers, sets an HttpOnly cookie, and resolves /me', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('origin', ORIGIN)
      .send({
        email: 'Ann@Example.com',
        username: 'ann',
        displayName: 'Ann',
        password: 'correct-horse-battery',
      })
      .expect(201);
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/jandi_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(res.body.user.email).toBe('ann@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const session = await t.prisma.session.findFirstOrThrow();
    expect(session.tokenHash).not.toContain(setCookie.split(';')[0]!.split('=')[1]!);

    await request(t.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('cookie', setCookie.split(';')[0]!)
      .expect(200);
  });

  it('rejects duplicate email and username', async () => {
    const u = await registerUser(t, { username: 'dupe' });
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: u.email,
        username: 'other',
        displayName: 'X',
        password: 'correct-horse-battery',
      })
      .expect(409)
      .expect((r) => expect(r.body.error.code).toBe('EMAIL_TAKEN'));
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'new@example.com',
        username: 'dupe',
        displayName: 'X',
        password: 'correct-horse-battery',
      })
      .expect(409)
      .expect((r) => expect(r.body.error.code).toBe('USERNAME_TAKEN'));
  });

  it('logs in, logs out and revokes the session', async () => {
    const u = await registerUser(t);
    const login = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'correct-horse-battery' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('cookie', cookie)
      .set('origin', ORIGIN)
      .expect(204);
    await request(t.app.getHttpServer()).get('/api/v1/auth/me').set('cookie', cookie).expect(401);
  });

  it('rejects wrong passwords and unknown users identically', async () => {
    const u = await registerUser(t);
    const a = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'nope-nope-nope' });
    const b = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'nope-nope-nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('rate limits repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request(t.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'x@example.com', password: 'wrong-password' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('expires sessions', async () => {
    const u = await registerUser(t);
    await t.prisma.session.updateMany({
      where: { userId: u.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await u.agent.get('/api/v1/auth/me').expect(401);
  });

  it('blocks cross-origin state changes that carry a session cookie', async () => {
    const u = await registerUser(t);
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('cookie', u.cookie)
      .set('origin', 'https://evil.example')
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('CSRF_ORIGIN_MISMATCH'));
  });

  it('runs the password reset flow with a single-use token and revokes sessions', async () => {
    const u = await registerUser(t);
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: u.email })
      .expect(202);
    // Unknown emails get the same response (no enumeration).
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'nobody@example.com' })
      .expect(202);
    const mail = await request(t.app.getHttpServer())
      .get(`/api/v1/dev/mail?to=${u.email}`)
      .expect(200);
    const resetMail = mail.body.items.find((m: { subject: string }) => m.subject.includes('Reset'));
    const token = /token=([\w-]+)/.exec(resetMail.text)![1]!;
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'brand-new-password' })
      .expect(204);
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'another-password' })
      .expect(400);
    await u.agent.get('/api/v1/auth/me').expect(401);
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'brand-new-password' })
      .expect(200);
  });

  it('verifies email with the emailed token', async () => {
    const u = await registerUser(t);
    const mail = await request(t.app.getHttpServer())
      .get(`/api/v1/dev/mail?to=${u.email}`)
      .expect(200);
    const token = /token=([\w-]+)/.exec(mail.body.items[0].text)![1]!;
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(204);
    const me = await u.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.emailVerified).toBe(true);
  });

  it('creates guests that cannot use account-only routes', async () => {
    const g = await createGuest(t);
    const me = await g.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.isGuest).toBe(true);
    await g.agent.get('/api/v1/auth/sessions').expect(403);
  });

  it('changes password and revokes other sessions', async () => {
    const u = await registerUser(t);
    const other = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'correct-horse-battery' });
    const otherCookie = (other.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await u.agent
      .post('/api/v1/auth/password')
      .send({ currentPassword: 'correct-horse-battery', newPassword: 'even-better-password' })
      .expect(204);
    await u.agent.get('/api/v1/auth/me').expect(200);
    await request(t.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('cookie', otherCookie)
      .expect(401);
  });

  it('exposes OAuth providers only when configured', async () => {
    const res = await request(t.app.getHttpServer())
      .get('/api/v1/auth/oauth/providers')
      .expect(200);
    expect(res.body.items).toEqual([]);
    await request(t.app.getHttpServer()).get('/api/v1/auth/oauth/github/start').expect(404);
  });
});
