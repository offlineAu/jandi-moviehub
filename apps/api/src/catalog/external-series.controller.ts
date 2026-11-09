import { Controller, Get, Injectable, Param } from '@nestjs/common';
import type { RoomTvEpisode } from '@jandi/shared';
import { z } from 'zod';
import { Public, RateLimit } from '../common/auth-context';
import { AppError, Errors } from '../common/errors';
import { providerFailure } from './provider-error';
import { ValidQuery } from '../common/zod';

const item = z.object({ id: z.number().int().positive(), title: z.string().min(1).max(300) });
const details = item.extend({
  episodes: z
    .array(z.object({ id: z.number().int().positive(), number: z.number().nonnegative() }))
    .max(2000),
});

async function readJson(path: string): Promise<unknown> {
  try {
    const response = await fetch(`https://kisskh.do/api/${path}`, {
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw providerFailure('KissKH', null, response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw providerFailure('KissKH', error);
  }
}

@Injectable()
export class ExternalSeriesService {
  async resolveRoomEpisode(
    episode: Extract<RoomTvEpisode, { provider: 'kisskh' | 'kisskh-direct' }>,
  ) {
    const { series } = await this.show(String(episode.seriesId));
    const normalized = series.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const match = normalized.match(/^money heist(?: (?:season|part) (\d+))?$/);
    if (!match || Number(match[1] ?? 1) !== episode.season)
      throw Errors.badRequest(
        'KISSKH_INVALID_EPISODE',
        'The selected KissKH part does not match this series.',
      );
    const selected = series.episodes.find(
      (item) => item.id === episode.episodeId && item.number === episode.episode,
    );
    if (!selected)
      throw Errors.badRequest(
        'KISSKH_INVALID_EPISODE',
        'This episode is not listed in the selected KissKH part.',
      );
    return { series, episode: selected };
  }

  async search(query: { q: string }) {
    const parsed = z
      .array(item)
      .max(1000)
      .safeParse(await readJson(`DramaList/Search?q=${encodeURIComponent(query.q)}`));
    if (!parsed.success)
      throw Errors.unavailable(
        'EXTERNAL_SOURCE_UNAVAILABLE',
        'The external catalog returned invalid data.',
      );
    return { items: parsed.data.slice(0, 30) };
  }

  async show(id: string) {
    const parsedId = z.coerce.number().int().positive().max(2147483647).safeParse(id);
    if (!parsedId.success)
      throw Errors.badRequest('INVALID_PARAMETER', 'Invalid external series ID');
    const parsed = details.safeParse(await readJson(`DramaList/Drama/${parsedId.data}?isq=false`));
    if (!parsed.success || parsed.data.id !== parsedId.data)
      throw Errors.unavailable(
        'EXTERNAL_SOURCE_UNAVAILABLE',
        'The external series returned invalid data.',
      );
    return {
      series: {
        id: parsed.data.id,
        title: parsed.data.title,
        episodes: parsed.data.episodes.sort((a, b) => a.number - b.number),
      },
    };
  }
}

@Controller('external-series')
export class ExternalSeriesController {
  constructor(private readonly service: ExternalSeriesService = new ExternalSeriesService()) {}
  @Public()
  @RateLimit({ name: 'external-series-search', limit: 60, windowSec: 60 })
  @Get('search')
  search(@ValidQuery(z.object({ q: z.string().trim().min(2).max(120) })) query: { q: string }) {
    return this.service.search(query);
  }
  @Public()
  @RateLimit({ name: 'external-series-details', limit: 60, windowSec: 60 })
  @Get(':id')
  show(@Param('id') id: string) {
    return this.service.show(id);
  }
}
