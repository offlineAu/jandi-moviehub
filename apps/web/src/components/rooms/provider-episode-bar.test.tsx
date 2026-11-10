import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProviderEpisodeBar, VidsrcEpisodeBar, nextProviderEpisode } from './provider-episode-bar';

const change = vi.fn();
vi.mock('./room-dialogs', () => ({ useChangeRoomMovie: () => ({ change, busy: false }) }));
vi.mock('@/components/series/provider-series', () => ({
  useProviderSeries: () => ({ seasons, loading: false, error: null, retry: vi.fn() }),
}));
vi.mock('@/components/series/tv-episodes', () => ({
  useTvSeries: () => ({
    data: {
      series: {
        title: 'Example',
        seasons: [
          { season_number: 1, episode_count: 2 },
          { season_number: 2, episode_count: 1 },
        ],
      },
    },
    isPending: false,
    isError: false,
  }),
  useTvSeason: (_id: string, season: number | null) => ({
    data: { season: { episodes: season === 1 ? [{ number: 1 }, { number: 2 }] : [{ number: 1 }] } },
    isPending: false,
    isError: false,
  }),
  playableSeasons: (seasons: { season_number: number }[]) => seasons,
}));

const seasons = [
  {
    number: 1,
    name: 'Part 1',
    id: 2510,
    episodes: [
      { number: 1, id: 101 },
      { number: 2, id: 102 },
    ],
  },
  { number: 2, name: 'Part 2', id: 2511, episodes: [{ number: 1, id: 201 }] },
];
const episode = {
  provider: 'kisskh-direct' as const,
  tvId: '71446' as const,
  numbering: 'provider' as const,
  season: 1,
  episode: 1,
  seriesId: 2510,
  episodeId: 101,
};
const props = {
  roomId: 'room',
  socket: null,
  engine: null,
  canControl: true,
  marathonActive: false,
};
beforeEach(() => change.mockReset());

it('changes the shared room to the next provider episode', () => {
  render(<ProviderEpisodeBar {...props} episode={episode} />);
  fireEvent.click(screen.getByRole('button', { name: /next episode/i }));
  expect(change).toHaveBeenCalledWith('kisskh-direct:71446:1:2:2510:102', expect.any(String));
});

it('uses the next part’s actual provider IDs at a season boundary', () => {
  expect(nextProviderEpisode(seasons, { ...episode, episode: 2, episodeId: 102 })).toEqual({
    ...episode,
    season: 2,
    episode: 1,
    seriesId: 2511,
    episodeId: 201,
  });
});

it('does not invent a next episode for an unknown identity or missing provider IDs', () => {
  expect(nextProviderEpisode(seasons, { ...episode, episodeId: 999 })).toBeNull();
  expect(
    nextProviderEpisode(
      [{ ...seasons[0]!, episodes: [{ number: 1, id: 101 }, { number: 2 }] }],
      episode,
    ),
  ).toBeNull();
});

it('does not offer a room change to viewers or during a marathon', () => {
  const view = render(<ProviderEpisodeBar {...props} episode={episode} canControl={false} />);
  expect(screen.queryByRole('button', { name: /next episode/i })).toBeNull();
  view.rerender(<ProviderEpisodeBar {...props} episode={episode} marathonActive />);
  expect(screen.queryByRole('button', { name: /next episode/i })).toBeNull();
});

it('advances a VidSrc series across seasons using the same provider', () => {
  render(
    <VidsrcEpisodeBar
      {...props}
      episode={{ provider: 'vidsrc', type: 'tv', tvId: 123, tmdbId: 123, season: 1, episode: 2 }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /next episode/i }));
  expect(change).toHaveBeenCalledWith('vidsrc:tv:123:2:1', expect.any(String));
});
