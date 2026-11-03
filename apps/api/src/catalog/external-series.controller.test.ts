import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalSeriesController } from './external-series.controller';

afterEach(() => vi.unstubAllGlobals());

describe('external series lookup', () => {
  it('returns source labels without guessing a TMDB episode match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { id: 2510, title: 'Money Heist - Season 1', thumbnail: 'https://untrusted.example' },
            ]),
          ),
      ),
    );
    await expect(new ExternalSeriesController().search({ q: 'Money Heist' })).resolves.toEqual({
      items: [{ id: 2510, title: 'Money Heist - Season 1' }],
    });
  });
  it('sorts provider episode numbers and verifies the requested source ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 2510,
              title: 'Money Heist - Season 1',
              episodes: [
                { id: 2, number: 2 },
                { id: 1, number: 1 },
              ],
            }),
          ),
      ),
    );
    const result = await new ExternalSeriesController().show('2510');
    expect(result.series.episodes.map((episode) => episode.number)).toEqual([1, 2]);
    await expect(new ExternalSeriesController().show('2511')).rejects.toMatchObject({
      code: 'EXTERNAL_SOURCE_UNAVAILABLE',
    });
  });
});
