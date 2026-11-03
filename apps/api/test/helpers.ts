import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS } from '../src/redis/redis.module';
import { RealtimeIoAdapter } from '../src/realtime/io-adapter';
import type { Redis } from 'ioredis';

export const ORIGIN = 'http://localhost:3000';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  redis: Redis;
  baseUrl: string;
  close: () => Promise<void>;
}

/** Boots the full application (HTTP + Socket.IO) on an ephemeral port against the test DB. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  const adapter = new RealtimeIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);
  await app.listen(0);
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS);
  return { app, prisma, redis, baseUrl: `http://localhost:${port}`, close: () => app.close() };
}

/** Empties every application table and the test Redis database. */
export async function resetState(t: TestApp) {
  const tables = await t.prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await t.prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
  await clearRedis(t);
}

/** Deletes only this run's Redis keys. */
export async function clearRedis(t: TestApp) {
  // Delete only this run's keys (the client's keyPrefix is not applied to SCAN results).
  const prefix = process.env.REDIS_KEY_PREFIX ?? '';
  let cursor = '0';
  do {
    const [next, keys] = await t.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
    cursor = next;
    if (keys.length) await t.redis.del(...keys.map((k) => k.slice(prefix.length)));
  } while (cursor !== '0');
}

let counter = 0;

export interface TestUser {
  id: string;
  username: string;
  email: string;
  cookie: string;
  agent: ReturnType<typeof request.agent>;
}

/** Registers a user and returns a supertest agent carrying the session cookie and Origin header. */
export async function registerUser(
  t: TestApp,
  overrides: Partial<{ username: string; role: 'USER' | 'MODERATOR' | 'ADMIN' }> = {},
): Promise<TestUser> {
  counter += 1;
  const username = overrides.username ?? `user_${Date.now().toString(36)}_${counter}`.slice(0, 24);
  const email = `${username}@example.test`;
  const res = await request(t.app.getHttpServer())
    .post('/api/v1/auth/register')
    .set('origin', ORIGIN)
    .send({ email, username, displayName: username, password: 'correct-horse-battery' })
    .expect(201);
  const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  const id = res.body.user.id as string;
  if (overrides.role && overrides.role !== 'USER') {
    await t.prisma.user.update({ where: { id }, data: { role: overrides.role } });
  }
  return { id, username, email, cookie, agent: authed(t, cookie) };
}

export async function createGuest(t: TestApp, displayName = 'Guesty') {
  const res = await request(t.app.getHttpServer())
    .post('/api/v1/auth/guest')
    .set('origin', ORIGIN)
    .send({ displayName })
    .expect(201);
  const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  return { id: res.body.user.id as string, cookie, agent: authed(t, cookie) };
}

/** A thin wrapper so every request carries the cookie + allowed Origin. */
export function authed(t: TestApp, cookie: string) {
  const server = t.app.getHttpServer();
  const wrap = (method: 'get' | 'post' | 'put' | 'patch' | 'delete') => (url: string) =>
    request(server)[method](url).set('cookie', cookie).set('origin', ORIGIN);
  return {
    get: wrap('get'),
    post: wrap('post'),
    put: wrap('put'),
    patch: wrap('patch'),
    delete: wrap('delete'),
  } as unknown as ReturnType<typeof request.agent>;
}

/** Connects an authenticated Socket.IO client. */
export function connectSocket(t: TestApp, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(t.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie, origin: ORIGIN },
      reconnection: false,
      forceNew: true,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

export function emitAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 5000,
): Promise<T> {
  return socket.timeout(timeoutMs).emitWithAck(event, payload) as Promise<T>;
}

export function nextEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
  predicate: (p: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}
