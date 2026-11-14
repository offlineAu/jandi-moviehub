import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { TvPlayback } from './tv-playback';

vi.mock('@/components/player', () => ({
  VideoPlayer: ({
    onPlaybackErrorChange,
  }: {
    onPlaybackErrorChange: (failed: boolean) => void;
  }) => <button onClick={() => onPlaybackErrorChange(true)}>Fail video</button>,
}));
vi.mock('@/lib/queries/auth', () => ({ useMe: () => ({ data: { isGuest: false } }) }));
vi.mock('@/lib/queries/room-sources', () => ({
  useRoomSourceCapabilities: () => ({ data: { playbackPipeline: true } }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));

it('tries the canonical episode embed after a local player fails', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.endsWith('/availability')) return { playable: true, movieId: 'movie' };
    if (path.endsWith('/playback'))
      return { sources: [{ url: 'https://media.example/video.m3u8' }] };
    if (path === '/room-sources/candidates/episode')
      return { candidates: [{ provider: 'vidsrc', state: 'listed' }] };
    throw new Error(`Unexpected request: ${path}`);
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TvPlayback
        id="1399"
        season="2"
        episode="3"
        title="Example"
        seriesTitle="Series"
        still={null}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Fail video' }));
  expect((await screen.findByTitle('Third-party player: Example')).getAttribute('src')).toBe(
    'https://vidsrc.sh/embed/tv/1399/2/3',
  );
});
