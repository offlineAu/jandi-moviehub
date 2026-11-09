import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { VidsrcRoomPlayer } from './vidsrc-room-player';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
const media = {
  provider: 'vidsrc' as const,
  type: 'tv' as const,
  tvId: 1399,
  tmdbId: 1399,
  season: 1,
  episode: 2,
};
it('requires provider activation, ignores foreign events, and reloads locally', () => {
  const engine = { attachPlayer: vi.fn(), intent: vi.fn(async () => true), current: null };
  render(
    <VidsrcRoomPlayer
      src="https://vidsrc.sh/embed/tv/1399/1/2"
      title="Example"
      media={media}
      engine={engine as unknown as RoomSyncEngine}
      canControl
      episodeHref="/watch/embed?example"
    />,
  );
  const frame = screen.getByTitle('Example VidSrc player') as HTMLIFrameElement;
  const play = screen.getByRole('button', { name: 'Play for everyone' }) as HTMLButtonElement;
  expect(play.disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Tap play');
  const data = {
    type: 'PLAYER_EVENT',
    data: {
      player_info: { tmdb: 1399, mediaType: 'tv', season: 1, episode: 2 },
      player_status: 'playing',
      player_progress: 10,
      player_duration: 600,
    },
  };
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'https://bad.example',
        data,
      }),
    ),
  );
  expect(play.disabled).toBe(true);
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'https://vidsrc.sh',
        data,
      }),
    ),
  );
  expect(play.disabled).toBe(false);
  fireEvent.click(play);
  expect(engine.intent).toHaveBeenCalledWith({ type: 'play' });
  fireEvent.click(screen.getByRole('button', { name: 'Reload my player' }));
  expect(screen.getByTitle('Example VidSrc player')).not.toBe(frame);
  expect(play.disabled).toBe(true);
  expect(screen.getByRole('link').getAttribute('target')).toBe('_blank');
});
