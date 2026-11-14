import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { RoomSourceRecovery } from './room-source-recovery';

const change = vi.fn();
vi.mock('./room-dialogs', () => ({ useChangeRoomMovie: () => ({ change, busy: false }) }));
vi.mock('@/lib/queries/room-sources', () => ({
  useRoomSourceCapabilities: () => ({ data: { playbackPipeline: true } }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));

it('asks the host to select a listed compatible alternative and changes the room only on click', async () => {
  vi.mocked(apiFetch).mockResolvedValue({
    candidates: [
      { provider: 'kisskh-direct', state: 'listed', roomControls: 'native' },
      { provider: 'vidsrc', state: 'listed', roomControls: 'experimental' },
      { provider: 'local', state: 'missing', roomControls: 'native' },
    ],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RoomSourceRecovery
        media={{
          provider: 'kisskh-direct',
          type: 'movie',
          movieId: '00000000-0000-4000-8000-000000000001',
          tmdbId: 155,
        }}
        roomId="room"
        socket={null}
        engine={null}
      />
    </QueryClientProvider>,
  );
  const button = await screen.findByRole('button', { name: 'Use VidSrc' });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(change).toHaveBeenCalledWith(
    'vidsrc:movie:00000000-0000-4000-8000-000000000001',
    expect.any(String),
  );
});
