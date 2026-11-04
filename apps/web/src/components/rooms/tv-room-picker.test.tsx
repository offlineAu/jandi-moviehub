import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
