import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ enabled: false, apiFetch: vi.fn() }));
vi.mock('@/lib/queries/room-sources', () => ({
  useRoomSourceCapabilities: () => ({
    data: { kisskhDirectSync: mocks.enabled },
    isLoading: false,
  }),
}));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/components/player', () => ({
  VideoPlayer: ({ mode }: { mode: string }) => <div data-testid="jandi-player">{mode}</div>,
}));
beforeEach(() => {
  mocks.enabled = false;
  mocks.apiFetch.mockReset();
});
import { KisskhRoomPlayer } from './kisskh-room-player';
it('embeds the shared episode, labels local controls, and reloads only the local frame', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <KisskhRoomPlayer
        episode={{
          provider: 'kisskh',
          tvId: '71446',
          season: 1,
          episode: 1,
          seriesId: 2510,
          episodeId: 57281,
          numbering: 'provider',
        }}
        src="https://kisskh.megaplay.su/kisskh/57281"
        title="Money Heist Part 1 Episode 1"
        episodeHref="/watch/tv/71446/season/1/episode/1?provider=kisskh&numbering=provider"
      />
    </QueryClientProvider>,
  );
  const frame = screen.getByTitle('Money Heist Part 1 Episode 1 KissKH player');
  expect(frame.getAttribute('src')).toBe('https://kisskh.megaplay.su/kisskh/57281');
  expect(screen.getByText(/Play, pause and seeking are controlled individually/)).toBeTruthy();
  const separatePlayer = screen.getByRole('link', {
    name: 'Player blank? Open this episode separately',
  });
  expect(separatePlayer.getAttribute('href')).toBe(
    '/watch/tv/71446/season/1/episode/1?provider=kisskh&numbering=provider',
  );
  expect(separatePlayer.getAttribute('target')).toBe('_blank');
  fireEvent.click(screen.getByRole('button', { name: 'Reload my player' }));
  expect(screen.getByTitle('Money Heist Part 1 Episode 1 KissKH player')).not.toBe(frame);
});

it('uses the local Jandi player and allows switching back to the provider embed', async () => {
  mocks.enabled = true;
  mocks.apiFetch.mockResolvedValue({
    sources: [{ assetId: 'episode', url: '/video.m3u8', captions: [] }],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <KisskhRoomPlayer
        episode={{
          provider: 'kisskh',
          tvId: '71446',
          season: 4,
          episode: 1,
          seriesId: 2513,
          episodeId: 57306,
          numbering: 'provider',
        }}
        src="https://kisskh.megaplay.su/kisskh/57306"
        title="Episode 1"
      />
    </QueryClientProvider>,
  );
  expect((await screen.findByTestId('jandi-player')).textContent).toBe('solo');
  expect(mocks.apiFetch).toHaveBeenCalledWith('/room-sources/kisskh/episode', {
    query: { season: 4, episode: 1, seriesId: 2513, episodeId: 57306 },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Use alternate player' }));
  expect(screen.getByTitle('Episode 1 KissKH player')).toBeTruthy();
});
