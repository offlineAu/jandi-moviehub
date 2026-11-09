import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ExternalMedia } from '@jandi/shared';
import { InjectRedis } from '../redis/redis.module';
import type { Redis } from 'ioredis';
import { AppError, Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';

export function vidsrcPath(media: ExternalMedia) {
  return media.type === 'movie'
    ? `movie/${media.tmdbId}`
    : `tv/${media.tmdbId}/${media.season}/${media.episode}`;
}
const listing = z.object({
  status_code: z.literal(200),
  tmdb_id: z.coerce.number().int().positive(),
  type: z.enum(['movie', 'episode']),
  season: z.coerce.number().int().optional(),
  episode: z.coerce.number().int().optional(),
});

@Injectable()
export class VidsrcService {
  private readonly pending = new Map<string, Promise<boolean>>();
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}
  get enabled() {
    return this.config.env.ENABLE_VIDSRC_ROOM_SYNC;
  }
  assertEnabled() {
    if (!this.enabled)
      throw Errors.unavailable(
        'VIDSRC_SYNC_DISABLED',
        'Synchronized embed playback is not enabled.',
      );
  }
  embedUrl(media: ExternalMedia) {
    return `https://vidsrc.sh/embed/${vidsrcPath(media)}?autoplay=0&autonext=0`;
  }
  async listed(media: ExternalMedia): Promise<boolean> {
    const path = vidsrcPath(media);
    const key = `vidsrc:listing:${path}`;
    const cached = await this.redis.get(key);
    if (cached === '1' || cached === '0') return cached === '1';
    const inflight = this.pending.get(path);
    if (inflight) return inflight;
    const promise = this.fetchListing(media)
      .then(async (available) => {
        await this.redis.set(key, available ? '1' : '0', 'EX', available ? 300 : 60);
        return available;
      })
      .finally(() => this.pending.delete(path));
    this.pending.set(path, promise);
    return promise;
  }
  private async fetchListing(media: ExternalMedia) {
    try {
      const response = await fetch(`https://vidsrc.sh/info/${vidsrcPath(media)}.json`, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = listing.parse(await response.json());
      if (
        data.tmdb_id !== media.tmdbId ||
        data.type !== (media.type === 'movie' ? 'movie' : 'episode') ||
        (media.type === 'tv' && (data.season !== media.season || data.episode !== media.episode))
      )
        throw new Error('Mismatched identity');
      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Errors.unavailable(
        'EXTERNAL_SOURCE_UNAVAILABLE',
        'VidSrc could not be checked. Try again later.',
      );
    }
  }
}
