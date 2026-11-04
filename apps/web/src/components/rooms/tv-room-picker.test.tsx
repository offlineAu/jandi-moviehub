import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TvRoomPicker } from './tv-room-picker';
import { apiFetch } from '@/lib/api';
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

it('finds Money Heist and selects the catalog episode for the room', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === '/tv/search')
      return {
        items: [
          { id: 71446, title: 'Money Heist' },
          { id: 99, title: 'Another series' },
        ],
      };
    if (path === '/tv/71446/seasons/2')
      return { season: { episodes: [{ id: 1, number: 1, title: "We're Back" }] } };
    throw new Error(`Unexpected request ${path}`);
  });
  const onSelect = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TvRoomPicker query="Money Heist" onSelect={onSelect} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /Money Heist/ }));
  expect(
    (screen.getByRole('combobox', { name: 'Episode season' }) as HTMLSelectElement).value,
  ).toBe('2');
  fireEvent.click(await screen.findByRole('button', { name: "Episode 1 · We're Back" }));
  expect(onSelect).toHaveBeenCalledWith('moviebox:71446:2:1');
});
