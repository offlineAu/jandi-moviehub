import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalSeriesController, ExternalSeriesService } from './external-series.controller';

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

describe('KissKH room episode verification', () => {
  const episode = {
    provider: 'kisskh' as const,
    numbering: 'provider' as const,
    tvId: '71446' as const,
    season: 1,
    episode: 1,
    seriesId: 2510,
    episodeId: 57281,
  };
  it('verifies the source series, part and episode ID before sharing the embed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          id: 2510,
          title: 'Money Heist - Season 1',
          episodes: [{ id: 57281, number: 1 }],
        }),
      ),
    );
    const result = await new ExternalSeriesService().resolveRoomEpisode(episode);
    expect(result.episode).toEqual({ id: 57281, number: 1 });
    await expect(
      new ExternalSeriesService().resolveRoomEpisode({ ...episode, episodeId: 999 }),
    ).rejects.toMatchObject({ code: 'KISSKH_INVALID_EPISODE' });
    await expect(
      new ExternalSeriesService().resolveRoomEpisode({ ...episode, season: 2 }),
    ).rejects.toMatchObject({ code: 'KISSKH_INVALID_EPISODE' });
  });
  it('does not accept an unrelated series or swallow a provider HTTP 451', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: 2510, title: 'Money Heist Korea', episodes: [{ id: 57281, number: 1 }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ExternalSeriesService().resolveRoomEpisode(episode)).rejects.toMatchObject({
      code: 'KISSKH_INVALID_EPISODE',
    });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 451 }));
    await expect(new ExternalSeriesService().resolveRoomEpisode(episode)).rejects.toMatchObject({
      code: 'KISSKH_HTTP_451',
    });
  });
});
