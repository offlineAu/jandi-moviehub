import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { type Job, Queue, Worker } from 'bullmq';
import { AppConfig } from '../config/app-config';
import { ErrorReporter } from '../common/error-reporter';
import type { Redis } from 'ioredis';
import { InjectRedis, RedisFactory } from '../redis/redis.module';

export type TimerJobName =
  | 'playback-end'
  | 'marathon-phase'
  | 'marathon-scheduled'
  | 'host-grace'
  | 'room-reminder'
  | 'room-expiry-sweep';
type Handler = (data: Record<string, unknown>, job: Job) => Promise<void>;

/**
 * Durable, cross-instance timers on BullMQ. Jobs can be retried or redelivered after a worker
 * failure, so handlers must re-check state (versions) and make stale timers no-ops.
 */
@Injectable()
export class TimerQueue implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TimerQueue.name);
  private readonly handlers = new Map<TimerJobName, Handler>();
  private queue!: Queue;
  private worker?: Worker;

  constructor(
    private readonly redis: RedisFactory,
    private readonly config: AppConfig,
    private readonly reporter: ErrorReporter,
    @InjectRedis() private readonly kv: Redis,
  ) {}

  onModuleInit() {
    const prefix = `jandi${this.config.env.REDIS_KEY_PREFIX ? `-${this.config.env.REDIS_KEY_PREFIX.replace(/:$/, '')}` : ''}`;
    this.queue = new Queue('room-timers', {
      connection: this.redis.create({ forQueue: true }),
      prefix,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 1000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
      },
    });
  }

  onApplicationBootstrap() {
    if (!this.config.env.QUEUE_WORKERS) return;
    const prefix = this.queue.opts.prefix;
    this.worker = new Worker(
      'room-timers',
      async (job) => {
        const handler = this.handlers.get(job.name as TimerJobName);
        if (!handler) throw new Error(`No timer handler registered for ${job.name}`);
        await handler(job.data as Record<string, unknown>, job);
      },
      { connection: this.redis.create({ forQueue: true }), prefix, concurrency: 16 },
    );
    this.worker.on('failed', (job, err) =>
      this.reporter.report(err, { job: job?.name, jobId: job?.id }),
    );
  }

  register(name: TimerJobName, handler: Handler) {
    this.handlers.set(name, handler);
  }

  private latestKey(name: TimerJobName, key: string) {
    return `${this.queue.opts.prefix}:timer-latest:${name}:${key}`;
  }

  /**
   * Schedules a delayed job, superseding the previous timer for the same key. Ids are unique
   * per call: re-arming from inside the job that holds the previous id must not collide with it.
   */
  async schedule(name: TimerJobName, key: string, data: Record<string, unknown>, delayMs: number) {
    await this.cancel(name, key);
    const id =
      `${name}__${key}__${Date.now().toString(36)}${randomBytes(4).toString('hex')}`.replace(
        /:/g,
        '_',
      );
    await this.queue.add(name, data, { jobId: id, delay: Math.max(0, Math.round(delayMs)) });
    await this.kv.set(
      this.latestKey(name, key),
      id,
      'PX',
      Math.max(60_000, Math.round(delayMs) + 3_600_000),
    );
  }

  /** Removes the pending timer for a key (a job that is already running is left to finish). */
  async cancel(name: TimerJobName, key: string) {
    const id = await this.kv.get(this.latestKey(name, key));
    if (!id) return;
    const job = await this.queue.getJob(id);
    if (job && (await job.isDelayed())) await job.remove().catch(() => undefined);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
