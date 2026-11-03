import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGuest, createTestApp, registerUser, resetState, type TestApp } from './helpers';
import { createPlayableMovie } from './fixtures';

describe('rooms (integration)', () => {
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

  const makeRoom = async (
    agent: Awaited<ReturnType<typeof registerUser>>['agent'],
    body: Record<string, unknown>,
  ) => {
    const res = await agent
      .post('/api/v1/rooms')
      .send({ name: 'Movie Night', ...body })
      .expect(201);
    return res.body.room as { id: string; code: string };
  };

  it('creates a public room that others can discover and join', async () => {
    const host = await registerUser(t);
    const fan = await registerUser(t);
    const movie = await createPlayableMovie(t.prisma);
    const room = await makeRoom(host.agent, { visibility: 'PUBLIC', movieId: movie.id });
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const list = await request(t.app.getHttpServer()).get('/api/v1/rooms').expect(200);
    expect(list.body.items.map((r: { id: string }) => r.id)).toContain(room.id);
    expect(list.body.items[0].movie.title).toBe(movie.title);

    await fan.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);
    const members = await fan.agent.get(`/api/v1/rooms/${room.id}/members`).expect(200);
    expect(members.body.items.map((m: { role: string }) => m.role).sort()).toEqual([
      'HOST',
      'MEMBER',
    ]);
    // Playback state was initialised with the movie loaded.
    const pb = await fan.agent.get(`/api/v1/rooms/${room.id}/playback-state`).expect(200);
    expect(pb.body.state).toMatchObject({ movieId: movie.id, status: 'paused', version: 1 });
  });

  it('never exposes private rooms in discovery or by code, and requires an invite', async () => {
    const host = await registerUser(t);
    const outsider = await registerUser(t);
    const room = await makeRoom(host.agent, { visibility: 'PRIVATE', name: 'Secret Screening' });

    const list = await request(t.app.getHttpServer()).get('/api/v1/rooms').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('Secret Screening');
    await outsider.agent.get(`/api/v1/rooms/code/${room.code}`).expect(404);
    await outsider.agent
      .post(`/api/v1/rooms/${room.id}/join`)
      .send({})
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('INVITE_REQUIRED'));
    await outsider.agent.get(`/api/v1/rooms/${room.id}`).expect(403);

    const inv = await host.agent
      .post(`/api/v1/rooms/${room.id}/invites`)
      .send({ maxUses: 1, expiresInHours: 1 })
      .expect(201);
    const token = inv.body.invite.token as string;
    expect(token.length).toBeGreaterThanOrEqual(43); // 256-bit base64url
    const stored = await t.prisma.roomInvite.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);

    const resolved = await outsider.agent.get(`/api/v1/invites/${token}`).expect(200);
    expect(resolved.body.room.name).toBe('Secret Screening');
    await outsider.agent
      .post(`/api/v1/rooms/${room.id}/join`)
      .send({ inviteToken: token })
      .expect(200);

    // max uses = 1
    const third = await registerUser(t);
    await third.agent
      .post(`/api/v1/rooms/${room.id}/join`)
      .send({ inviteToken: token })
      .expect(403);
    await third.agent.get(`/api/v1/invites/${token}`).expect(404);
  });

  it('enforces room passwords and hides details until joined', async () => {
    const host = await registerUser(t);
    const fan = await registerUser(t);
    const room = await makeRoom(host.agent, {
      visibility: 'PASSWORD',
      password: 'popcorn',
      description: 'hidden desc',
    });
    const stored = await t.prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);

    const preview = await fan.agent.get(`/api/v1/rooms/code/${room.code}`).expect(200);
    expect(preview.body.access.requiresPassword).toBe(true);
    expect(preview.body.room.description).toBeNull();

    await fan.agent
      .post(`/api/v1/rooms/${room.id}/join`)
      .send({})
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('PASSWORD_REQUIRED'));
    await fan.agent
      .post(`/api/v1/rooms/${room.id}/join`)
      .send({ password: 'nachos' })
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('WRONG_PASSWORD'));
    await fan.agent.post(`/api/v1/rooms/${room.id}/join`).send({ password: 'popcorn' }).expect(200);
  });

  it('limits friends-only rooms to friends of the host', async () => {
    const host = await registerUser(t);
    const friend = await registerUser(t);
    const stranger = await registerUser(t);
    await friend.agent
      .post('/api/v1/friends/requests')
      .send({ username: host.username })
      .expect(201);
    const reqs = await host.agent.get('/api/v1/friends/requests').expect(200);
    await host.agent
      .post(`/api/v1/friends/requests/${reqs.body.incoming[0].id}/accept`)
      .expect(204);

    const room = await makeRoom(host.agent, { visibility: 'FRIENDS' });
    await stranger.agent.get(`/api/v1/rooms/code/${room.code}`).expect(404);
    await stranger.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(403);
    await friend.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);
    const friendsRooms = await friend.agent.get('/api/v1/rooms/friends').expect(200);
    expect(friendsRooms.body.items.map((r: { id: string }) => r.id)).toContain(room.id);
  });

  it('admits guests only when the room allows them', async () => {
    const host = await registerUser(t);
    const closed = await makeRoom(host.agent, { visibility: 'PUBLIC', allowGuests: false });
    const open = await makeRoom(host.agent, { visibility: 'PUBLIC', allowGuests: true });
    const guest = await createGuest(t);
    await guest.agent
      .post(`/api/v1/rooms/${closed.id}/join`)
      .send({})
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('GUESTS_NOT_ALLOWED'));
    await guest.agent.post(`/api/v1/rooms/${open.id}/join`).send({}).expect(200);
    await guest.agent
      .post('/api/v1/rooms')
      .send({ name: 'Guest room', visibility: 'PUBLIC' })
      .expect(403);
  });

  it('enforces the moderation permission matrix', async () => {
    const host = await registerUser(t);
    const cohost = await registerUser(t);
    const member = await registerUser(t);
    const room = await makeRoom(host.agent, { visibility: 'PUBLIC' });
    for (const u of [cohost, member])
      await u.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);

    await member.agent
      .patch(`/api/v1/rooms/${room.id}/members/${cohost.id}`)
      .send({ role: 'COHOST' })
      .expect(403);
    await host.agent
      .patch(`/api/v1/rooms/${room.id}/members/${cohost.id}`)
      .send({ role: 'COHOST' })
      .expect(204);
    await cohost.agent.delete(`/api/v1/rooms/${room.id}/members/${host.id}`).expect(403);
    await member.agent.delete(`/api/v1/rooms/${room.id}/members/${cohost.id}`).expect(403);
    await member.agent.patch(`/api/v1/rooms/${room.id}`).send({ name: 'Hijacked' }).expect(403);

    await cohost.agent
      .post(`/api/v1/rooms/${room.id}/bans/${member.id}`)
      .send({ reason: 'spoilers' })
      .expect(204);
    await member.agent
      .post(`/api/v1/rooms/${room.id}/join`)
      .send({})
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('BANNED'));
    await host.agent.delete(`/api/v1/rooms/${room.id}/bans/${member.id}`).expect(204);
    await member.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);
  });

  it('transfers host and closes rooms', async () => {
    const host = await registerUser(t);
    const fan = await registerUser(t);
    const room = await makeRoom(host.agent, { visibility: 'PUBLIC' });
    await fan.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);
    await fan.agent.post(`/api/v1/rooms/${room.id}/transfer`).send({ userId: fan.id }).expect(403);
    await host.agent.post(`/api/v1/rooms/${room.id}/transfer`).send({ userId: fan.id }).expect(204);
    const after = await t.prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(after.hostId).toBe(fan.id);
    await host.agent.delete(`/api/v1/rooms/${room.id}`).expect(403); // no longer host
    await fan.agent.delete(`/api/v1/rooms/${room.id}`).expect(204);
    const late = await registerUser(t);
    await late.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(409);
  });

  it('auto-transfers host when the host leaves', async () => {
    const host = await registerUser(t);
    const fan = await registerUser(t);
    const room = await makeRoom(host.agent, { visibility: 'PUBLIC' });
    await fan.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);
    await host.agent.post(`/api/v1/rooms/${room.id}/leave`).expect(204);
    expect((await t.prisma.room.findUniqueOrThrow({ where: { id: room.id } })).hostId).toBe(fan.id);
  });

  it('rejects full rooms', async () => {
    const host = await registerUser(t);
    const room = await makeRoom(host.agent, { visibility: 'PUBLIC', maxMembers: 2 });
    const a = await registerUser(t);
    const b = await registerUser(t);
    await a.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);
    await b.agent
      .post(`/api/v1/rooms/${room.id}/join`)
      .send({})
      .expect(409)
      .expect((r) => expect(r.body.error.code).toBe('ROOM_FULL'));
  });
});
