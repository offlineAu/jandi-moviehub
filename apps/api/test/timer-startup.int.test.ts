import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { expect, it } from 'vitest';
import type { AppConfig } from '../src/config/app-config';
import type { ErrorReporter } from '../src/common/error-reporter';
import type { RedisFactory } from '../src/redis/redis.module';
import { TimerQueue } from '../src/queue/timer-queue.service';

it('processes a timer that becomes due while the application is starting', async () => {
  const prefix = `startup-${randomUUID()}`;
  const clients: Redis[] = [];
  const create = () => {
    const client = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    clients.push(client);
    return client;
  };
  const kv = create();
  const config = { env: { REDIS_KEY_PREFIX: prefix, QUEUE_WORKERS: true } } as AppConfig;
  const timers = new TimerQueue(
    { create } as unknown as RedisFactory,
    config,
    { report: () => undefined } as unknown as ErrorReporter,
    kv,
  );
  const cleanup = new Queue('room-timers', { connection: create(), prefix: `jandi-${prefix}` });
  try {
    timers.onModuleInit();
    await timers.schedule('marathon-phase', 'startup', { roomId: 'room' }, 0);
    await new Promise((resolve) => setTimeout(resolve, 250));
    let resolveHandled!: (data: Record<string, unknown>) => void;
    const handled = new Promise<Record<string, unknown>>((resolve) => {
      resolveHandled = resolve;
    });
    timers.register('marathon-phase', async (data) => {
      resolveHandled(data);
    });
    timers.onApplicationBootstrap();
    await expect(
      Promise.race([
        handled,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timer was not delivered')), 5000),
        ),
      ]),
    ).resolves.toEqual({ roomId: 'room' });
  } finally {
    await timers.onModuleDestroy();
    await cleanup.obliterate({ force: true });
    await cleanup.close();
    await kv.del(`jandi-${prefix}:timer-latest:marathon-phase:startup`);
    await Promise.all(clients.map((client) => client.quit()));
  }
});
