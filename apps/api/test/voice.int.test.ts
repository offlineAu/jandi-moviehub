import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGuest, createTestApp, registerUser, resetState, type TestApp } from './helpers';

describe('voice (integration, LiveKit not configured)', () => {
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

  it('reports voice as unconfigured', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/voice/status').expect(200);
    expect(res.body).toEqual({ configured: false });
  });

  it('returns 503 VOICE_NOT_CONFIGURED to members (guests included) and 403 to non-members', async () => {
    const host = await registerUser(t);
    const outsider = await registerUser(t);
    const guest = await createGuest(t);
    const room = (
      await host.agent
        .post('/api/v1/rooms')
        .send({ name: 'Voice room', visibility: 'PUBLIC', allowGuests: true })
        .expect(201)
    ).body.room;
    await guest.agent.post(`/api/v1/rooms/${room.id}/join`).send({}).expect(200);

    const res = await host.agent.post(`/api/v1/rooms/${room.id}/voice-token`).expect(503);
    expect(res.body.error.code).toBe('VOICE_NOT_CONFIGURED');
    expect(
      (await guest.agent.post(`/api/v1/rooms/${room.id}/voice-token`).expect(503)).body.error.code,
    ).toBe('VOICE_NOT_CONFIGURED');
    const denied = await outsider.agent.post(`/api/v1/rooms/${room.id}/voice-token`).expect(403);
    expect(denied.body.error.code).toBe('NOT_IN_ROOM');
    await request(t.app.getHttpServer()).post(`/api/v1/rooms/${room.id}/voice-token`).expect(401);
  });
});
