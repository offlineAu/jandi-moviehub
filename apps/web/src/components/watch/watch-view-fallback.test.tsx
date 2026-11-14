import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { WatchView } from './watch-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/layout/require-account', () => ({
  RequireAccount: ({ children }: { children: () => React.ReactNode }) => children(),
}));
vi.mock('@/components/player', () => ({
  VideoPlayer: ({
    onPlaybackErrorChange,
  }: {
    onPlaybackErrorChange: (failed: boolean) => void;
  }) => <button onClick={() => onPlaybackErrorChange(true)}>Simulate failed stream</button>,
}));
vi.mock('@/lib/queries/catalog', () => ({
  useMovie: () => ({ data: { title: 'Example', genres: [] } }),
  usePlayback: () => ({
    isError: true,
    error: new ApiError({ status: 404, code: 'NOT_PLAYABLE', message: 'Not available' }),
  }),
  useSeriesNavigation: () => ({}),
}));
vi.mock('@/lib/queries/library', () => ({
  useLibraryStatus: () => ({ isLoading: false }),
  saveProgress: vi.fn(),
}));
const capabilities = vi.hoisted(() => ({ kisskhDirectSync: true, playbackPipeline: false }));
vi.mock('@/lib/queries/room-sources', () => ({
  useRoomSourceCapabilities: () => ({ data: capabilities }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));
beforeEach(() => {
  capabilities.playbackPipeline = false;
  vi.mocked(apiFetch).mockReset();
});

it('automatically opens the alternate player after a direct stream fails', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.includes('/room-sources/kisskh/movie/'))
      return { sources: [{ url: 'https://media.example/video.m3u8' }] };
    if (path.endsWith('/external-source'))
      return { available: true, embedUrl: 'https://vidsrc.sh/embed/movie/1' };
    throw new Error(`Unexpected request: ${path}`);
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WatchView id="movie" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Simulate failed stream' }));
  expect(await screen.findByTitle('Third-party player: Example')).toBeTruthy();
});

it('shows the unavailable state when the alternate player has no source', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.includes('/room-sources/kisskh/movie/'))
      return { sources: [{ url: 'https://media.example/video.m3u8' }] };
    if (path.endsWith('/external-source')) return { available: false, embedUrl: null };
    throw new Error(`Unexpected request: ${path}`);
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WatchView id="movie" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Simulate failed stream' }));
  expect(await screen.findByText('Not available to stream')).toBeTruthy();
});

it('allows retrying when the alternate source check fails', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.includes('/room-sources/kisskh/movie/'))
      return { sources: [{ url: 'https://media.example/video.m3u8' }] };
    if (path.endsWith('/external-source')) throw new Error('Service unavailable');
    throw new Error(`Unexpected request: ${path}`);
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WatchView id="movie" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Simulate failed stream' }));
  expect(await screen.findByText('Couldn’t check another player')).toBeTruthy();
});

it('uses the listed alternate when the candidate pipeline finds a direct resolver outage', async () => {
  capabilities.playbackPipeline = true;
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.includes('/candidates/movie/'))
      return {
        candidates: [
          { provider: 'kisskh-direct', state: 'unavailable' },
          { provider: 'vidsrc', state: 'listed' },
        ],
      };
    if (path.endsWith('/external-source'))
      return { available: true, embedUrl: 'https://vidsrc.sh/embed/movie/1' };
    throw new Error(`Unexpected request: ${path}`);
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WatchView id="movie" />
    </QueryClientProvider>,
  );
  expect(await screen.findByTitle('Third-party player: Example')).toBeTruthy();
  expect(
    vi.mocked(apiFetch).mock.calls.some(([path]) => path.includes('/room-sources/kisskh/movie/')),
  ).toBe(false);
});
