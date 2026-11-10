import { Injectable, Logger } from '@nestjs/common';
import type { RoomTvEpisode } from '@jandi/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app-config';
import { Errors } from '../common/errors';
import { InjectRedis } from '../redis/redis.module';
import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { srtToVtt } from './moviebox.controller';

type KisskhEpisode = Extract<RoomTvEpisode, { provider: 'kisskh' | 'kisskh-direct' }>;
const streamsSchema = z.object({
  streams: z
    .array(z.object({ name: z.string().max(300).optional(), url: z.string().max(8192).optional() }))
    .max(100),
});
async function readBounded(response: Response, limit: number) {
  if (Number(response.headers.get('content-length') || 0) > limit || !response.body)
    throw new Error('Invalid response size');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) throw new Error('Invalid response size');
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Experimental Stremio-compatible resolver. Stream bytes always travel directly to the viewer. */
@Injectable()
export class KisskhStreamService {
  private readonly logger = new Logger(KisskhStreamService.name);
  private warming: Promise<void> | null = null;
  private readonly pending = new Map<
    string,
    Promise<{ url: string; format: 'HLS' | 'MP4'; mimeType: string }>
  >();
  constructor(
    private readonly config: AppConfig,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  get enabled() {
    return (
      this.config.env.ENABLE_KISSKH_DIRECT_SYNC && !!this.config.env.KISSKH_STREAM_RESOLVER_URL
    );
  }

  assertEnabled() {
    if (!this.enabled)
      throw Errors.unavailable(
        'KISSKH_DIRECT_DISABLED',
        'Synchronized KissKH playback is not enabled.',
      );
  }

  warm() {
    this.assertEnabled();
    if (this.warming) return;
    const started = Date.now();
    const base = this.config.env.KISSKH_STREAM_RESOLVER_URL!.replace(/\/$/, '');
    this.warming = (async () => {
      try {
        const response = await fetch(`${base}/manifest.json`, {
          signal: AbortSignal.timeout(85000),
          redirect: 'error',
        });
        this.logger.log(
          `Resolver warm-up ${response.ok ? 'ready' : 'unavailable'} in ${Date.now() - started}ms (HTTP ${response.status})`,
        );
        await response.body?.cancel();
      } catch (error) {
        this.logger.warn(
          `Resolver warm-up ${error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed'} after ${Date.now() - started}ms`,
        );
      } finally {
        this.warming = null;
      }
    })();
  }

  async resolve(episode: KisskhEpisode) {
    const key = `${episode.seriesId}:${episode.episode}:${episode.episodeId}`;
    return this.resolveId('series', `kisskh:${episode.seriesId}:1:${episode.episode}`, key);
  }

  async resolveMovie(tmdbId: number) {
    return this.resolveId('movie', `tmdb:${tmdbId}`, `movie:${tmdbId}`);
  }

  async captions(type: 'movie' | 'series', id: string) {
    this.assertEnabled();
    try {
      const base = this.config.env.KISSKH_STREAM_RESOLVER_URL!.replace(/\/$/, '');
      const response = await fetch(`${base}/subtitles/${type}/${encodeURIComponent(id)}.json`, {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) return [];
      const body = await readBounded(response, 256000);
      const parsed = z
        .object({
          subtitles: z
            .array(
              z.object({
                id: z.string().max(200),
                lang: z.string().regex(/^[a-z]{2,3}$/i),
                url: z.string().max(8192),
              }),
            )
            .max(100),
        })
        .parse(JSON.parse(body));
      const captions: Array<{ lang: string; label: string; url: string }> = [];
      for (const item of parsed.subtitles) {
        if (!item.id.startsWith('kisskh-')) continue;
        let url: URL;
        try {
          url = new URL(item.url);
        } catch {
          continue;
        }
        if (
          url.protocol !== 'https:' ||
          url.hostname !== 'sub.cdnvideo11.shop' ||
          url.username ||
          url.password ||
          !url.pathname.toLowerCase().endsWith('.srt')
        )
          continue;
        const token = randomBytes(24).toString('hex');
        await this.redis.set(`kisskh:caption:${token}`, url.href, 'EX', 7200);
        let label = item.lang.toUpperCase();
        try {
          label = new Intl.DisplayNames(['en'], { type: 'language' }).of(item.lang) ?? label;
        } catch {
          /* Use the language code. */
        }
        captions.push({
          lang: item.lang,
          label,
          url: `/api/v1/room-sources/kisskh/captions/${token}`,
        });
      }
      return captions;
    } catch {
      this.logger.warn('KissKH subtitles could not be loaded');
      return [];
    }
  }

  async caption(token: string) {
    if (!/^[a-f0-9]{48}$/.test(token)) throw Errors.notFound('Captions');
    const stored = await this.redis.get(`kisskh:caption:${token}`);
    if (!stored) throw Errors.notFound('Captions');
    const url = new URL(stored);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'sub.cdnvideo11.shop' ||
      url.username ||
      url.password
    )
      throw Errors.notFound('Captions');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error('Caption unavailable');
      return srtToVtt(await readBounded(response, 1000000));
    } catch {
      throw Errors.unavailable('KISSKH_CAPTION_UNAVAILABLE', 'This subtitle track is unavailable.');
    }
  }

  private async resolveId(type: 'series' | 'movie', id: string, key: string) {
    this.assertEnabled();
    const previous = this.pending.get(key);
    if (previous) return previous;
    const request = this.fetchStream(type, id);
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }

  private async fetchStream(type: 'series' | 'movie', id: string) {
    const started = Date.now();
    const base = this.config.env.KISSKH_STREAM_RESOLVER_URL!.replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${base}/stream/${type}/${encodeURIComponent(id)}.json`, {
        headers: { Accept: 'application/json' },
        // The free resolver may need up to a minute to wake after being idle.
        signal: AbortSignal.timeout(85000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('resolver unavailable');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 256_000) throw new Error('oversized resolver response');
      const body = await response.text();
      if (body.length > 256_000) throw new Error('oversized resolver response');
      const parsed = streamsSchema.parse(JSON.parse(body));
      for (const stream of parsed.streams) {
        if (!stream.url || !/kisskh/i.test(stream.name ?? '')) continue;
        try {
          const url = new URL(stream.url);
          if (url.protocol !== 'https:' || url.username || url.password) continue;
          const path = url.pathname.toLowerCase();
          const format = path.endsWith('.m3u8') ? 'HLS' : path.endsWith('.mp4') ? 'MP4' : null;
          if (!format) continue;
          this.logger.log(`Resolver returned a compatible stream in ${Date.now() - started}ms`);
          return {
            url: url.href,
            format,
            mimeType: format === 'HLS' ? 'application/vnd.apple.mpegurl' : 'video/mp4',
          } as const;
        } catch {
          /* Ignore malformed provider URLs. */
        }
      }
    } catch (error) {
      this.logger.warn(
        `Resolver ${error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed'} after ${Date.now() - started}ms`,
      );
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw Errors.unavailable(
          'KISSKH_DIRECT_UNAVAILABLE',
          'KissKH is taking too long to start. Please try again.',
        );
      }
      throw Errors.unavailable(
        'KISSKH_DIRECT_UNAVAILABLE',
        'The KissKH stream resolver is unavailable. Try again later.',
      );
    }
    this.logger.warn(`Resolver returned no compatible stream after ${Date.now() - started}ms`);
    throw Errors.unavailable(
      'KISSKH_DIRECT_NO_STREAM',
      'No compatible direct KissKH stream was found for this title.',
    );
  }
}
