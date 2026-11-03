import { describe, expect, it, vi } from 'vitest';
import { Errors } from '../common/errors';
import type { TmdbTvProvider } from './providers/tmdb-tv.provider';
import { TvMetadataService } from './tv.service';

describe('TV episode metadata', () => {
  it('navigates across regular seasons, skipping empty or missing seasons and excluding specials', async () => {
    const seasons = [0, 1, 2, 3, 4].map((n) => ({ season_number: n, episode_count: 2 }));
    const provider = {
      detail: vi.fn().mockResolvedValue({ seasons }),
      season: vi.fn(async (_id: number, number: number) => {
        if (number === 2) throw Errors.notFound('Season');
        const episodes =
          number === 3
            ? []
            : [
                { number: 1, seasonNumber: number },
                { number: 3, seasonNumber: number },
              ];
        return { name: 'Season', overview: '', episodes };
      }),
    } as unknown as TmdbTvProvider;
    const service = new TvMetadataService(provider);
    expect(await service.episode(71446, 1, 3)).toMatchObject({
      previous: { seasonNumber: 1, number: 1 },
      next: { seasonNumber: 4, number: 1 },
    });
    expect(await service.episode(71446, 4, 1)).toMatchObject({
      previous: { seasonNumber: 1, number: 3 },
      next: { seasonNumber: 4, number: 3 },
    });
    expect(await service.episode(71446, 0, 3)).toMatchObject({ next: null });
    await expect(service.episode(71446, 1, 2)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('propagates upstream errors rather than treating an outage as a missing season', async () => {
    const provider = {
      detail: vi.fn().mockResolvedValue({
        seasons: [
          { season_number: 1, episode_count: 1 },
          { season_number: 2, episode_count: 1 },
        ],
      }),
      season: vi.fn(async (_id: number, n: number) => {
        if (n === 2) throw Errors.unavailable('UPSTREAM_UNAVAILABLE', 'Offline');
        return { episodes: [{ number: 1, seasonNumber: n }] };
      }),
    } as unknown as TmdbTvProvider;
    await expect(new TvMetadataService(provider).episode(1, 1, 1)).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });
});
