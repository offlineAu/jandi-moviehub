import { type ChatMessageDto, type CommandAck, SocketEvents } from '@jandi/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  connectSocket,
  createTestApp,
  emitAck,
  ORIGIN,
  registerUser,
  resetState,
  type TestApp,
} from './helpers';

describe('admin settings are enforced (integration)', () => {
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

  it('closes registration when registration.enabled is false', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    await admin.agent
      .put('/api/v1/admin/settings/registration.enabled')
      .send({ value: false })
      .expect(200);
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('origin', ORIGIN)
      .send({
        email: 'late@example.com',
        username: 'late_comer',
        displayName: 'Late',
        password: 'correct-horse-battery',
      })
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('REGISTRATION_DISABLED'));
    // Existing accounts can still log in.
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'correct-horse-battery' })
      .expect(200);
  });

  it('applies rooms.maxMembersDefault when maxMembers is omitted', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    await admin.agent
      .put('/api/v1/admin/settings/rooms.maxMembersDefault')
      .send({ value: 7 })
      .expect(200);
    const room = await admin.agent
      .post('/api/v1/rooms')
      .send({ name: 'Default size', visibility: 'PUBLIC' })
      .expect(201);
    expect(room.body.room.maxMembers).toBe(7);
    const explicit = await admin.agent
      .post('/api/v1/rooms')
      .send({ name: 'Explicit size', visibility: 'PUBLIC', maxMembers: 3 })
      .expect(201);
    expect(explicit.body.room.maxMembers).toBe(3);
  });

  it('enforces chat slow mode', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    await admin.agent
      .put('/api/v1/admin/settings/chat.slowModeSec')
      .send({ value: 10 })
      .expect(200);
    const room = await admin.agent
      .post('/api/v1/rooms')
      .send({ name: 'Slow room', visibility: 'PUBLIC' })
      .expect(201);
    const s = await connectSocket(t, admin.cookie);
    await emitAck(s, SocketEvents.ROOM_JOIN, { roomId: room.body.room.id });
    const first = await emitAck<CommandAck<ChatMessageDto>>(s, SocketEvents.CHAT_SEND, {
      roomId: room.body.room.id,
      body: 'one',
    });
    const second = await emitAck<CommandAck<ChatMessageDto>>(s, SocketEvents.CHAT_SEND, {
      roomId: room.body.room.id,
      body: 'two',
    });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    s.disconnect();
  });
});
