import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/app-config';
import type { ErrorReporter } from '../common/error-reporter';
import type { RedisFactory } from '../redis/redis.module';
import { TimerQueue } from './timer-queue.service';

const mock = vi.hoisted(() => ({ processors: [] as Array<(job: Job) => Promise<void>> }));
vi.mock('bullmq', () => ({
  Queue: class {
    opts = { prefix: 'jandi-test' };
    close = vi.fn();
  },
  Worker: class {
    constructor(_name: string, processor: (job: Job) => Promise<void>) {
      mock.processors.push(processor);
    }
    on = vi.fn();
    close = vi.fn();
  },
}));

describe('timer worker startup', () => {
  beforeEach(() => {
    mock.processors.length = 0;
  });

  it('waits until application bootstrap to consume jobs and dispatches registered handlers', async () => {
    const factory = { create: vi.fn(() => ({})) } as unknown as RedisFactory;
    const config = { env: { QUEUE_WORKERS: true } } as AppConfig;
    const queue = new TimerQueue(factory, config, {} as ErrorReporter, {} as Redis);
    queue.onModuleInit();
    expect(mock.processors).toHaveLength(0);
    const handler = vi.fn().mockResolvedValue(undefined);
    queue.register('marathon-phase', handler);
    queue.onApplicationBootstrap();
    expect(mock.processors).toHaveLength(1);
    const job = { name: 'marathon-phase', data: { roomId: 'room' } } as Job;
    await mock.processors[0]!(job);
    expect(handler).toHaveBeenCalledWith(job.data, job);
    await expect(mock.processors[0]!({ name: 'unknown', data: {} } as Job)).rejects.toThrow(
      'No timer handler registered for unknown',
    );
    await queue.onModuleDestroy();
  });
});
