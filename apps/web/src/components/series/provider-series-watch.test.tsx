import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderSeriesWatch } from './provider-series-watch';
import { apiFetch } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { providerWatchHref } from './provider-series';

const navigation = vi.hoisted(() => ({
  query: 'provider=moviebox&numbering=provider',
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));
vi.mock('@/components/player', () => ({ VideoPlayer: () => <div data-testid="jandi-player" /> }));
const counts = [13, 9, 8, 8, 10];
const parts = counts.map((count, index) => ({
  number: index + 1,
  name: `Part ${index + 1}`,
  episodes: Array.from({ length: count }, (_, i) => ({ number: i + 1 })),
}));
function mount(season: string, episode: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProviderSeriesWatch season={season} episode={episode} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  navigation.query = 'provider=moviebox&numbering=provider';
  navigation.replace.mockReset();
  vi.mocked(apiFetch)
    .mockReset()
    .mockImplementation(async (path) => {
      if (path === '/moviebox/episodes') return { seasons: parts };
      if (path === '/tv/71446')
        return {
          series: {
            title: 'Money Heist',
            backdropUrl: 'https://image.tmdb.org/t/p/w500/series.jpg',
          },
        };
      if (path === '/tv/71446/seasons/2')
        return {
          season: {
            episodes: [
              {
                number: 1,
                title: "We're Back",
                stillUrl: 'https://image.tmdb.org/t/p/w500/part3.jpg',
              },
              {
                number: 9,
                title: 'Game Over',
                stillUrl: 'https://image.tmdb.org/t/p/w500/part4.jpg',
              },
            ],
          },
        };
      if (path === '/tv/71446/seasons/3') return { season: { episodes: [] } };
      if (path === '/moviebox/playback')
        return {
          sources: [{ id: '480', url: '/api/v1/moviebox/media/test', resolution: 480 }],
          englishVtt: null,
        };
      if (path === '/external-series/search')
        return {
          items: [
            { id: 10, title: 'Money Heist - Season 1' },
            { id: 20, title: 'Money Heist - Season 2' },
          ],
        };
      if (path === '/external-series/10')
        return {
          series: {
            id: 10,
            title: 'Money Heist - Season 1',
            episodes: [
              { number: 1, id: 101 },
              { number: 2, id: 102 },
            ],
          },
        };
      if (path === '/external-series/20')
        return {
          series: { id: 20, title: 'Money Heist - Season 2', episodes: [{ number: 1, id: 201 }] },
        };
      throw new Error(`Unexpected request ${path}`);
    });
});
describe('provider episode navigation', () => {
  it('opens the Jandi player for a direct KissKH episode with its source identifiers', async () => {
    navigation.query = 'provider=kisskh-direct&numbering=provider';
    const original = vi.mocked(apiFetch).getMockImplementation()!;
    vi.mocked(apiFetch).mockImplementation(async (...args) => {
      if (args[0] === '/room-sources/capabilities') return { kisskhDirectSync: true };
      if (args[0] === '/room-sources/kisskh/episode') return { sources: [{ assetId: 'direct' }] };
      return original(...args);
    });
    mount('1', '2');
    expect(await screen.findByTestId('jandi-player')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith('/room-sources/kisskh/episode', {
      query: { season: 1, episode: 2, seriesId: 10, episodeId: 102 },
    });
    expect(screen.getByRole('link', { name: 'Watch together' }).getAttribute('href')).toContain(
      'kisskh-direct%3A71446',
    );
  });
  it('plays provider Part 1 directly, uses its 13-episode count, and crosses to Part 2', async () => {
    mount('1', '13');
    expect(await screen.findByLabelText('Original Spanish audio')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith('/moviebox/playback', {
      query: { tvId: '71446', season: '1', episode: '13', numbering: 'provider' },
    });
    expect(screen.getByRole('link', { name: /Next P2 E1/ }).getAttribute('href')).toBe(
      providerWatchHref('moviebox', 2, 1),
    );
    expect(screen.getByRole('option', { name: 'Part 1 · 13 episodes' })).toBeTruthy();
    expect(screen.getAllByAltText('Money Heist series artwork').length).toBe(13);
    expect(screen.queryByText('Episode 14')).toBeNull();
    expect(screen.getByRole('link', { name: 'Watch together' }).getAttribute('href')).toContain(
      'moviebox-source%3A71446%3A1%3A13',
    );
  });
  it('keeps provider Part 4 in playback requests and uses the mapped episode thumbnail', async () => {
    mount('4', '1');
    expect(await screen.findByLabelText('Original Spanish audio')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith('/moviebox/playback', {
      query: { tvId: '71446', season: '4', episode: '1', numbering: 'provider' },
    });
    expect(await screen.findByRole('heading', { name: 'Game Over' })).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /Part 4 · Episode 1/ })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toContain('part4.jpg');
    expect(screen.getByRole('link', { name: /Previous P3 E8/ }).getAttribute('href')).toBe(
      providerWatchHref('moviebox', 3, 8),
    );
  });
  it('does not reinterpret an old catalog Episode 14 link as provider playback', async () => {
    navigation.query = 'provider=moviebox';
    mount('1', '14');
    expect(
      await screen.findByText(/Choose a provider part and episode to start watching/),
    ).toBeTruthy();
    await screen.findByRole('link', { name: /Part 1 · Episode 13/ });
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === '/moviebox/playback')).toBe(
      false,
    );
    expect(screen.getByRole('heading', { name: 'Choose an episode' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
  });
  it('uses KissKH episode IDs and actual counts and preserves the provider in navigation', async () => {
    navigation.query = 'provider=kisskh&numbering=provider';
    mount('1', '2');
    const frame = await screen.findByTitle('Money Heist · KissKH · Part 1, Episode 2 player');
    expect(frame.getAttribute('src')).toBe('https://kisskh.megaplay.su/kisskh/102');
    expect(
      screen.getByRole('option', { name: 'Money Heist - Season 1 · 2 episodes' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Next P2 E1/ }).getAttribute('href')).toBe(
      providerWatchHref('kisskh', 2, 1),
    );
  });
  it('keeps provider playback available if optional artwork metadata fails', async () => {
    const original = vi.mocked(apiFetch).getMockImplementation()!;
    vi.mocked(apiFetch).mockImplementation(async (...args) => {
      if (args[0].startsWith('/tv/')) throw new Error('TMDB unavailable');
      return original(...args);
    });
    mount('1', '1');
    expect(await screen.findByLabelText('Original Spanish audio')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Next P1 E2/ })).toBeTruthy();
  });
  it('resets selection when switching providers instead of preserving a catalog episode', async () => {
    mount('1', '1');
    await screen.findByLabelText('Original Spanish audio');
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback provider' }), {
      target: { value: 'kisskh' },
    });
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/watch/tv/71446/season/1/episode/1?provider=kisskh',
      ),
    );
  });
});
