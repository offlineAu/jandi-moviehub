import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { Public } from '../common/auth-context';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '../redis/redis.module';

async function timed(check: () => Promise<unknown>) {
  const start = performance.now();
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return { status: 'up' as const, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      status: 'down' as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  /** Liveness: the process is running. */
  @Public()
  @Get(['', 'live'])
  live() {
    return {
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: dependencies reachable. Returns 503 if any is down. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([
      timed(() => this.prisma.$queryRaw`SELECT 1`),
      timed(() => this.redis.ping()),
    ]);
    const ok = database.status === 'up' && redis.status === 'up';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database, redis },
      integrations: {
        catalog: this.config.tmdbEnabled ? 'tmdb' : 'local-demo',
        mail: this.config.env.MAIL_TRANSPORT,
        storage: this.config.env.STORAGE_DRIVER,
        voice: this.config.env.LIVEKIT_URL ? 'livekit' : 'not-configured',
      },
    };
  }
}
