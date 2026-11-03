import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { TvPlayback } from './tv-playback';

vi.mock('@/components/player', () => ({ VideoPlayer: () => null }));
vi.mock('@/lib/queries/auth', () => ({ useMe: () => ({ data: null, isLoading: false }) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));

it('defaults to KissKH Part 3 for catalog Season 2 and lets the user choose MovieBox', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.endsWith('/availability')) return { playable: false };
    if (path === '/external-series/search')
      return {
        items: [
          { id: 2, title: 'Money Heist - Season 2' },
          { id: 3, title: 'Money Heist - Season 3' },
        ],
      };
    if (path === '/external-series/3')
      return {
        series: { id: 3, title: 'Money Heist - Season 3', episodes: [{ id: 301, number: 1 }] },
      };
    if (path === '/moviebox/playback')
      return {
        audioLanguage: 'es',
        sources: [{ id: '480', resolution: 480, url: 'https://bcdnxw.hakunaymatata.com/test.mp4' }],
        englishVtt: null,
        subtitleStatus: 'UNAVAILABLE',
      };
    throw new Error(`Unexpected request: ${path}`);
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TvPlayback
        id="71446"
        season="2"
        episode="1"
        title="We're Back"
        seriesTitle="Money Heist"
        still={null}
      />
    </QueryClientProvider>,
  );
  const provider = screen.getByRole('combobox', { name: 'Playback provider' });
  expect((provider as HTMLSelectElement).value).toBe('kisskh');
  expect(
    (await screen.findByTitle('Money Heist - Season 3 episode 1 third-party player')).getAttribute(
      'src',
    ),
  ).toBe('https://kisskh.megaplay.su/kisskh/301');
  fireEvent.change(provider, { target: { value: 'moviebox' } });
  expect(await screen.findByLabelText('Original Spanish audio')).toBeTruthy();
  // The API maps MovieBox coordinates; the UI must not translate them twice.
  expect(apiFetch).toHaveBeenCalledWith('/moviebox/playback', {
    query: { tvId: '71446', season: '2', episode: '1' },
  });
});
