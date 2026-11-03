import { describe, expect, it, vi } from 'vitest';
import { TmdbTvProvider } from './tmdb-tv.provider';
import type { TmdbClient } from './tmdb.client';

describe('TMDB TV metadata', () => {
  it('maps TV genre names to TV genre IDs before discovery', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ genres: [{ id: 18, name: 'Drama' }] })
      .mockResolvedValueOnce({
        page: 1,
        total_pages: 1,
        results: [{ id: 71446, name: 'Example', overview: '', adult: false }],
      });
    const provider = new TmdbTvProvider({ get } as unknown as TmdbClient);
    expect((await provider.byGenre('drama', 1)).items[0]?.id).toBe(71446);
    expect(get).toHaveBeenCalledWith('/discover/tv', expect.objectContaining({ with_genres: 18 }));
  });
  it('searches by the supplied name and does not imply playback', async () => {
    const get = vi.fn().mockResolvedValue({
      page: 1,
      total_pages: 1,
      results: [
        {
          id: 71446,
          name: 'Money Heist',
          original_name: 'La Casa de Papel',
          overview: 'A series',
          poster_path: '/abc.jpg',
          backdrop_path: null,
          adult: false,
        },
      ],
    });
    const provider = new TmdbTvProvider({ get } as unknown as TmdbClient);
    const result = await provider.search('La Casa de Papel', 1);
    expect(get).toHaveBeenCalledWith(
      '/search/tv',
      expect.objectContaining({ query: 'La Casa de Papel' }),
    );
    expect(result.items[0]).toMatchObject({
      title: 'Money Heist',
      originalTitle: 'La Casa de Papel',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    });
  });
  it('labels episodes unplayable regardless of metadata and validates the upstream response', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        name: 'Part 1',
        overview: '',
        episodes: [{ id: 1, season_number: 1, episode_number: 1, name: 'Episode', overview: '' }],
      })
      .mockResolvedValueOnce({ results: 'invalid' });
    const provider = new TmdbTvProvider({ get } as unknown as TmdbClient);
    expect((await provider.season(71446, 1)).episodes[0]).toMatchObject({
      number: 1,
      playable: false,
    });
    await expect(provider.search('Money Heist', 1)).rejects.toThrow();
  });
});
