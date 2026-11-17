import { describe, expect, it, vi } from 'vitest';
import { EpisodeNavigationService } from './episode-navigation.service';
const episode = {
  provider: 'kisskh-direct' as const,
  tvId: '71446' as const,
  numbering: 'provider' as const,
  season: 3,
  episode: 8,
  seriesId: 2512,
  episodeId: 57291,
};
const state = (patch: object = {}) => ({ tvEpisode: episode, ...patch }) as never;
function setup() {
  const external = {
    search: vi.fn(async () => ({
      items: [
        { id: 2512, title: 'Money Heist - Season 3' },
        { id: 2513, title: 'Money Heist - Season 4' },
      ],
    })),
    show: vi.fn(async (id: string) => ({
      series: {
        episodes:
          id === '2512'
            ? [
                { number: 7, id: 57290 },
                { number: 8, id: 57291 },
              ]
            : [{ number: 1, id: 57306 }],
      },
    })),
  };
  return {
    service: new EpisodeNavigationService(external as never, {} as never, {} as never),
    external,
  };
}
describe('provider navigation', () => {
  it('returns exact provider identities across the part boundary and caches metadata', async () => {
    const { service, external } = setup();
    const result = await service.navigation(state());
    expect(result).toMatchObject({
      assetId: 'kisskh-direct:71446:3:8:2512:57291',
      previous: { id: 'kisskh-direct:71446:3:7:2512:57290' },
      next: {
        id: 'kisskh-direct:71446:4:1:2513:57306',
        label: 'Part 4, Episode 1',
        availability: 'listed',
      },
    });
    await service.navigation(state());
    expect(external.search).toHaveBeenCalledTimes(1);
  });
  it('does not invent an adjacent episode when a part is missing', async () => {
    const { service, external } = setup();
    external.search.mockResolvedValue({
      items: [
        { id: 2512, title: 'Money Heist - Season 3' },
        { id: 2513, title: 'Money Heist - Season 5' },
      ],
    });
    await expect(service.navigation(state())).rejects.toMatchObject({
      code: 'EPISODE_CATALOG_UNAVAILABLE',
    });
  });
  it('rejects a current episode with mismatched provider identity', async () => {
    const { service } = setup();
    await expect(
      service.navigation(state({ tvEpisode: { ...episode, episodeId: 999 } })),
    ).rejects.toMatchObject({ code: 'EPISODE_CATALOG_UNAVAILABLE' });
  });
});

it('keeps MovieBox provider numbering across parts', async () => {
  const moviebox = {
    episodes: vi.fn(async () => ({
      seasons: [
        { number: 1, episodes: [{ number: 1 }, { number: 2 }] },
        { number: 2, episodes: [{ number: 1 }] },
      ],
    })),
  };
  const service = new EpisodeNavigationService({} as never, moviebox as never, {} as never);
  const result = await service.navigation(
    state({ tvEpisode: { tvId: '71446', numbering: 'provider', season: 1, episode: 2 } }),
  );
  expect(result.next).toMatchObject({
    id: 'moviebox-source:71446:2:1',
    label: 'Part 2, Episode 1',
  });
});

it('uses the TV catalog coordinates for VidSrc without provider remapping', async () => {
  const tv = {
    episode: vi.fn(async () => ({
      previous: { seasonNumber: 1, number: 9 },
      next: { seasonNumber: 2, number: 1 },
    })),
  };
  const service = new EpisodeNavigationService({} as never, {} as never, tv as never);
  const result = await service.navigation(
    state({
      tvEpisode: null,
      externalMedia: {
        provider: 'vidsrc',
        type: 'tv',
        tvId: 123,
        tmdbId: 123,
        season: 1,
        episode: 10,
      },
    }),
  );
  expect(result.next).toMatchObject({ id: 'vidsrc:tv:123:2:1', label: 'S2 E1' });
});
