import { SocketEvents } from '@jandi/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import { EpisodeBar } from './episode-bar';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));

const NEXT_ID = '22222222-2222-4222-8222-222222222222';
const navigation = {
  kind: 'series',
  series: { id: 'series-1', title: 'Moonlight Drama' },
  current: { seasonNumber: 1, episodeNumber: 1 },
  previous: null,
  next: { movieId: NEXT_ID, title: 'Episode 2', seasonNumber: 1, episodeNumber: 2, playable: true },
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.endsWith('/series-navigation')) return { navigation };
    throw new Error(`Unexpected request: ${path}`);
  });
});

function setup(props: { canControl: boolean; marathonActive: boolean }) {
  const emitWithAck = vi.fn().mockResolvedValue({ ok: true, data: {} });
  const socket = { timeout: () => ({ emitWithAck }) } as unknown as Socket;
  const engine = { current: { version: 7 } } as unknown as RoomSyncEngine;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EpisodeBar
        roomId="room-1"
        movieId="11111111-1111-4111-8111-111111111111"
        status="ended"
        socket={socket}
        engine={engine}
        {...props}
      />
    </QueryClientProvider>,
  );
  return emitWithAck;
}

it('moves the whole room to the next episode when the viewer can control playback', async () => {
  const emitWithAck = setup({ canControl: true, marathonActive: false });
  expect(await screen.findByText('Moonlight Drama')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /next episode for everyone: S1 E2/i }));
  await waitFor(() =>
    expect(emitWithAck).toHaveBeenCalledWith(
      SocketEvents.MOVIE_CHANGE,
      expect.objectContaining({ roomId: 'room-1', movieId: NEXT_ID, baseVersion: 7 }),
    ),
  );
});

it('shows only what is up next to viewers without control', async () => {
  setup({ canControl: false, marathonActive: false });
  expect(await screen.findByText('Up next: S1 E2')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /next episode/i })).toBeNull();
});

it('leaves progression to the marathon while one is running', async () => {
  setup({ canControl: true, marathonActive: true });
  expect(await screen.findByText('Moonlight Drama')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /next episode/i })).toBeNull();
  expect(screen.queryByText(/up next/i)).toBeNull();
});
