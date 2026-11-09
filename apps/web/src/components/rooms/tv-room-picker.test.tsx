import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TvRoomPicker } from './tv-room-picker';
import { apiFetch } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));

function mount() {
  const onSelect = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TvRoomPicker query="Money Heist" onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return onSelect;
}
beforeEach(() => {
  vi.mocked(apiFetch)
    .mockReset()
    .mockImplementation(async (path) => {
      if (path === '/tv/search') return { items: [{ id: 71446, title: 'Money Heist' }] };
      if (path === '/moviebox/episodes')
        return { seasons: [{ number: 1, name: 'Part 1', episodes: [{ number: 1 }] }] };
      if (path === '/external-series/search')
        return { items: [{ id: 2510, title: 'Money Heist - Season 1' }] };
      if (path === '/external-series/2510')
        return {
          series: {
            id: 2510,
            title: 'Money Heist - Season 1',
            episodes: [{ id: 57281, number: 1 }],
          },
        };
      throw new Error(`Unexpected request ${path}`);
    });
});
it('warms the direct resolver when a host chooses the series', async () => {
  const original = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation(async (...args) => {
    if (args[0] === '/room-sources/capabilities') return { kisskhDirectSync: true };
    if (args[0] === '/room-sources/kisskh/warm') return { starting: true };
    return original(...args);
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /Money Heist/ }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith('/room-sources/kisskh/warm', { method: 'POST' }),
  );
});
it('defaults to KissKH and selects a shared provider episode for the room', async () => {
  const onSelect = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Money Heist/ }));
  expect(
    (screen.getByRole('combobox', { name: 'Room playback provider' }) as HTMLSelectElement).value,
  ).toBe('kisskh');
  expect(
    screen.getByText(/Each viewer controls play, pause and seeking individually/),
  ).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Episode 1' }));
  expect(onSelect).toHaveBeenCalledWith('kisskh:71446:1:1:2510:57281');
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === '/moviebox/episodes')).toBe(
    false,
  );
});
it('can switch to MovieBox for synchronized playback', async () => {
  const onSelect = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Money Heist/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Room playback provider' }), {
    target: { value: 'moviebox' },
  });
  await screen.findByRole('option', { name: 'Part 1 · 1 episodes' });
  fireEvent.click(await screen.findByRole('button', { name: 'Episode 1' }));
  expect(onSelect).toHaveBeenCalledWith('moviebox-source:71446:1:1');
});
it('lets the user choose KissKH when MovieBox fails', async () => {
  const original = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation(async (...args) => {
    if (args[0] === '/moviebox/episodes') throw new Error('MovieBox timed out');
    return original(...args);
  });
  const onSelect = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Money Heist/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Room playback provider' }), {
    target: { value: 'moviebox' },
  });
  expect((await screen.findByRole('alert')).textContent).toContain('MovieBox timed out');
  fireEvent.change(screen.getByRole('combobox', { name: 'Room playback provider' }), {
    target: { value: 'kisskh' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Episode 1' }));
  expect(onSelect).toHaveBeenCalledWith('kisskh:71446:1:1:2510:57281');
});
it('uses VidSrc for another series when sync is enabled and keeps its thumbnail', async () => {
  const original = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (path === '/room-sources/capabilities') return { vidsrcSync: true };
    if (path === '/tv/search') return { items: [{ id: 1399, title: 'Game of Thrones' }] };
    if (path === '/tv/1399')
      return {
        series: {
          id: 1399,
          title: 'Game of Thrones',
          seasons: [{ season_number: 1, name: 'Season 1', episode_count: 10 }],
        },
      };
    if (path === '/tv/1399/seasons/1')
      return {
        season: {
          episodes: [
            {
              id: 1,
              number: 1,
              title: 'Winter Is Coming',
              stillUrl: 'https://image.tmdb.org/t/p/w500/test.jpg',
            },
          ],
        },
      };
    if (path === '/room-sources/check') return { listed: true, playbackConfirmed: false };
    return original(path, options);
  });
  const onSelect = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Game of Thrones/ }));
  expect(
    ((await screen.findByRole('combobox', { name: 'Room playback provider' })) as HTMLSelectElement)
      .value,
  ).toBe('vidsrc');
  fireEvent.click(await screen.findByRole('button', { name: /Winter Is Coming/ }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('vidsrc:tv:1399:1:1'));
  expect(document.querySelector('img')?.getAttribute('src')).toContain('test.jpg');
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === '/external-series/search')).toBe(
    false,
  );
});

it('selects the experimental direct source only when enabled', async () => {
  const original = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation(async (...args) => {
    if (args[0] === '/room-sources/capabilities')
      return { vidsrcSync: false, kisskhDirectSync: true };
    return original(...args);
  });
  const onSelect = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Money Heist/ }));
  await screen.findByRole('option', { name: 'KissKH · Synced playback (experimental)' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Room playback provider' }), {
    target: { value: 'kisskh-direct' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Episode 1' }));
  expect(onSelect).toHaveBeenCalledWith('kisskh-direct:71446:1:1:2510:57281');
});
