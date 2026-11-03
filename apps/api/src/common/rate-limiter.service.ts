import { Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';
import { InjectRedis } from '../redis/redis.module';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Fixed-window counter in Redis; shared across API instances. */
@Injectable()
export class RateLimiterService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  async hit(key: string, baseLimit: number, windowSec: number): Promise<RateLimitResult> {
    const limit = baseLimit * this.config.env.RATE_LIMIT_MULTIPLIER;
    const redisKey = `rl:${key}`;
    const [[, count], [, ttl]] = (await this.redis
      .multi()
      .incr(redisKey)
      .pttl(redisKey)
      .exec()) as [[null, number], [null, number]];
    if (ttl < 0) await this.redis.pexpire(redisKey, windowSec * 1000);
    const retryAfterSec = Math.ceil((ttl < 0 ? windowSec * 1000 : ttl) / 1000);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec };
  }

  async reset(key: string) {
    await this.redis.del(`rl:${key}`);
  }
}
