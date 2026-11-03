import { type NotificationDto, SocketEvents } from '@jandi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  connectSocket,
  createTestApp,
  nextEvent,
  registerUser,
  resetState,
  type TestApp,
} from './helpers';

describe('friends and notifications (integration)', () => {
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

  it('sends, notifies, accepts and removes friends', async () => {
    const a = await registerUser(t);
    const b = await registerUser(t);
    const bSocket = await connectSocket(t, b.cookie);
    const live = nextEvent<NotificationDto>(bSocket, SocketEvents.NOTIFICATION);
    await a.agent.post('/api/v1/friends/requests').send({ username: b.username }).expect(201);
    expect((await live).type).toBe('FRIEND_REQUEST');
    bSocket.disconnect();

    const notes = await b.agent.get('/api/v1/notifications').expect(200);
    expect(notes.body.unreadCount).toBe(1);
    await b.agent.post('/api/v1/notifications/read-all').expect(204);
    expect(
      (await b.agent.get('/api/v1/notifications/unread-count').expect(200)).body.unreadCount,
    ).toBe(0);

    const reqs = await b.agent.get('/api/v1/friends/requests').expect(200);
    expect(reqs.body.incoming).toHaveLength(1);
    await a.agent.post(`/api/v1/friends/requests/${reqs.body.incoming[0].id}/accept`).expect(404); // only recipient
    await b.agent.post(`/api/v1/friends/requests/${reqs.body.incoming[0].id}/accept`).expect(204);
    const aFriends = await a.agent.get('/api/v1/friends').expect(200);
    expect(aFriends.body.items.map((f: { user: { id: string } }) => f.user.id)).toEqual([b.id]);
    const aNotes = await a.agent.get('/api/v1/notifications').expect(200);
    expect(aNotes.body.items[0].type).toBe('FRIEND_ACCEPTED');

    await a.agent.post('/api/v1/friends/requests').send({ username: b.username }).expect(409);
    await a.agent.delete(`/api/v1/friends/${b.id}`).expect(204);
    expect((await b.agent.get('/api/v1/friends').expect(200)).body.items).toHaveLength(0);
  });

  it('auto-accepts crossing requests and rejects self/guest targets', async () => {
    const a = await registerUser(t);
    const b = await registerUser(t);
    await a.agent.post('/api/v1/friends/requests').send({ username: b.username }).expect(201);
    const res = await b.agent
      .post('/api/v1/friends/requests')
      .send({ username: a.username })
      .expect(201);
    expect(res.body.status).toBe('ACCEPTED');
    await a.agent.post('/api/v1/friends/requests').send({ username: a.username }).expect(400);
    await a.agent.post('/api/v1/friends/requests').send({ username: 'nobody_here' }).expect(404);
  });

  it('shows presence only when the friend allows it and hides private rooms', async () => {
    const a = await registerUser(t);
    const b = await registerUser(t);
    await a.agent.post('/api/v1/friends/requests').send({ username: b.username }).expect(201);
    await b.agent.post('/api/v1/friends/requests').send({ username: a.username }).expect(201);
    const room = await b.agent
      .post('/api/v1/rooms')
      .send({ name: 'Hidden', visibility: 'PRIVATE' })
      .expect(201);
    const bs = await connectSocket(t, b.cookie);
    await bs.timeout(3000).emitWithAck(SocketEvents.ROOM_JOIN, { roomId: room.body.room.id });

    const list = await a.agent.get('/api/v1/friends').expect(200);
    expect(list.body.items[0]).toMatchObject({
      online: true,
      watching: { private: true, roomCode: null },
    });

    await t.prisma.userProfile.update({
      where: { userId: b.id },
      data: { showOnlineStatus: false },
    });
    const hidden = await a.agent.get('/api/v1/friends').expect(200);
    expect(hidden.body.items[0]).toMatchObject({ online: false, watching: null });
    bs.disconnect();
  });

  it('notifies invitees of targeted room invites', async () => {
    const host = await registerUser(t);
    const friend = await registerUser(t);
    const room = await host.agent
      .post('/api/v1/rooms')
      .send({ name: 'Invite only', visibility: 'PRIVATE' })
      .expect(201);
    await host.agent
      .post(`/api/v1/rooms/${room.body.room.id}/invites`)
      .send({ inviteeUserId: friend.id, expiresInHours: 2 })
      .expect(201);
    const notes = await friend.agent.get('/api/v1/notifications').expect(200);
    expect(notes.body.items[0]).toMatchObject({ type: 'ROOM_INVITE' });
    expect(notes.body.items[0].link).toMatch(/^\/join\//);
  });
});
