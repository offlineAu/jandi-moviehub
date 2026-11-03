import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';

export const REDIS = Symbol('REDIS');

/**
 * Creates Redis connections (commands, pub/sub, BullMQ). They are closed in
 * onApplicationShutdown, i.e. after the Socket.IO adapter and queues have stopped using them.
 */
@Injectable()
export class RedisFactory implements OnApplicationShutdown {
  private readonly clients: Redis[] = [];

  constructor(private readonly config: AppConfig) {}

  create(options: { forQueue?: boolean; pubSub?: boolean } = {}): Redis {
    const client = new Redis(this.config.env.REDIS_URL, {
      maxRetriesPerRequest: options.forQueue ? null : 3,
      // BullMQ manages its own prefix and must not get an ioredis keyPrefix.
      // Pub/sub channels must not be prefixed either (subscribe and publish must agree).
      keyPrefix: options.forQueue || options.pubSub ? undefined : this.config.env.REDIS_KEY_PREFIX,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    this.clients.push(client);
    return client;
  }

  async onApplicationShutdown() {
    await Promise.allSettled(this.clients.map((c) => c.quit()));
  }
}

@Global()
@Module({
  providers: [
    RedisFactory,
    { provide: REDIS, inject: [RedisFactory], useFactory: (f: RedisFactory) => f.create() },
  ],
  exports: [REDIS, RedisFactory],
})
export class RedisModule {}

export const InjectRedis = () => Inject(REDIS);
