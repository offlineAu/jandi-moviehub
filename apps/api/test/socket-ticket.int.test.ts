import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/common/crypto';
import {
  createGuest,
  createTestApp,
  ORIGIN,
  registerUser,
  resetState,
  type TestApp,
} from './helpers';

describe('cross-domain realtime connection tickets', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(t);
  });
  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await t.close();
  });

  async function connect(ticket: string, origin = ORIGIN): Promise<Socket> {
    const socket = io(t.baseUrl, {
      transports: ['websocket'],
      auth: { ticket },
      extraHeaders: { origin },
      reconnection: false,
      forceNew: true,
      timeout: 2000,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  it('authenticates without a cross-site cookie and rejects ticket reuse', async () => {
    const user = await registerUser(t);
    const result = await user.agent.post('/api/v1/auth/socket-ticket').expect(201);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.expiresIn).toBe(60);
    expect(result.body.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const socket = await connect(result.body.ticket);
    expect(socket.connected).toBe(true);
    await expect(connect(result.body.ticket)).rejects.toThrow();
  });

  it('requires authentication and an allowed origin to issue a ticket', async () => {
    await request(t.app.getHttpServer()).post('/api/v1/auth/socket-ticket').expect(401);
    const user = await registerUser(t);
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/socket-ticket')
      .set('cookie', user.cookie)
      .set('origin', 'https://evil.example')
      .expect(403);
  });

  it('supports guests', async () => {
    const guest = await createGuest(t);
    const result = await guest.agent.post('/api/v1/auth/socket-ticket').expect(201);
    expect((await connect(result.body.ticket)).connected).toBe(true);
  });

  it('rejects expired tickets and revoked sessions', async () => {
    const user = await registerUser(t);
    const expired = await user.agent.post('/api/v1/auth/socket-ticket').expect(201);
    await t.redis.del(`socket-ticket:${sha256(expired.body.ticket)}`);
    await expect(connect(expired.body.ticket)).rejects.toThrow();
    const revoked = await user.agent.post('/api/v1/auth/socket-ticket').expect(201);
    await user.agent.post('/api/v1/auth/logout').expect(204);
    await expect(connect(revoked.body.ticket)).rejects.toThrow();
  });

  it('rejects a disallowed WebSocket origin and malformed tickets', async () => {
    const user = await registerUser(t);
    const result = await user.agent.post('/api/v1/auth/socket-ticket').expect(201);
    await expect(connect(result.body.ticket, 'https://evil.example')).rejects.toThrow();
    await expect(connect('invalid')).rejects.toThrow();
  });
});
