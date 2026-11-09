import { Injectable } from '@nestjs/common';
import type { RoomTvEpisode } from '@jandi/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app-config';
import { Errors } from '../common/errors';

type KisskhEpisode = Extract<RoomTvEpisode, { provider: 'kisskh' | 'kisskh-direct' }>;
const streamsSchema = z.object({
  streams: z
    .array(z.object({ name: z.string().max(300).optional(), url: z.string().max(8192).optional() }))
    .max(100),
});

/** Experimental Stremio-compatible resolver. Stream bytes always travel directly to the viewer. */
@Injectable()
export class KisskhStreamService {
  private readonly pending = new Map<
    string,
    Promise<{ url: string; format: 'HLS' | 'MP4'; mimeType: string }>
  >();
  constructor(private readonly config: AppConfig) {}

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

  async resolve(episode: KisskhEpisode) {
    this.assertEnabled();
    const key = `${episode.seriesId}:${episode.episode}:${episode.episodeId}`;
    const previous = this.pending.get(key);
    if (previous) return previous;
    const request = this.fetchStream(episode);
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }

  private async fetchStream(episode: KisskhEpisode) {
    const base = this.config.env.KISSKH_STREAM_RESOLVER_URL!.replace(/\/$/, '');
    // Provider series ID and episode number are validated against the provider catalog first.
    const id = `kisskh:${episode.seriesId}:1:${episode.episode}`;
    let response: Response;
    try {
      response = await fetch(`${base}/stream/series/${encodeURIComponent(id)}.json`, {
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
    throw Errors.unavailable(
      'KISSKH_DIRECT_NO_STREAM',
      'No compatible direct KissKH stream was found for this episode.',
    );
  }
}
