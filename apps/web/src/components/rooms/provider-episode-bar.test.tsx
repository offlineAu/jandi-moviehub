import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProviderEpisodeBar } from './provider-episode-bar';
const mocks = vi.hoisted(() => ({ change: vi.fn(), fetch: vi.fn() }));
vi.mock('./room-dialogs', () => ({
  useChangeRoomMovie: () => ({ change: mocks.change, busy: false }),
}));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.fetch }));
const episode = {
  provider: 'kisskh-direct' as const,
  tvId: '71446' as const,
  numbering: 'provider' as const,
  season: 3,
  episode: 8,
  seriesId: 2512,
  episodeId: 57291,
};
const assetId = 'kisskh-direct:71446:3:8:2512:57291';
const props = {
  roomId: 'room',
  socket: null,
  engine: null,
  canControl: true,
  marathonActive: false,
};
const mount = (canControl = true) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProviderEpisodeBar {...props} canControl={canControl} episode={episode} />
    </QueryClientProvider>,
  );
beforeEach(() => {
  mocks.change.mockReset().mockResolvedValue(true);
  mocks.fetch.mockReset().mockResolvedValue({
    assetId,
    previous: { id: 'previous', label: 'Part 3, Episode 7', availability: 'listed' },
    next: { id: 'next', label: 'Part 4, Episode 1', availability: 'listed' },
  });
});
it('shows the server-identified destination and sends a guarded adjacent change', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /Next · Part 4, Episode 1/ }));
  expect(mocks.change).toHaveBeenCalledWith(
    'next',
    'Part 4, Episode 1 selected for everyone',
    'next',
  );
  fireEvent.click(await screen.findByRole('button', { name: /Previous · Part 3, Episode 7/ }));
  expect(mocks.change).toHaveBeenCalledWith(
    'previous',
    'Part 3, Episode 7 selected for everyone',
    'previous',
  );
});
it('shows the destination without allowing viewers to change it', async () => {
  mount(false);
  expect(await screen.findByText('Up next: Part 4, Episode 1')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
});
it('does not show destinations from a stale room response', async () => {
  mocks.fetch.mockResolvedValue({
    assetId: 'old',
    previous: null,
    next: { id: 'wrong', label: 'Wrong', availability: 'listed' },
  });
  mount();
  await screen.findByText('Loading episodes…');
  expect(screen.queryByText(/Wrong/)).toBeNull();
});
