import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TvRoomPicker } from './tv-room-picker';
import { apiFetch } from '@/lib/api';
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

it('finds Money Heist and selects the provider episode for the room', async () => {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === '/tv/search')
      return {
        items: [
          { id: 71446, title: 'Money Heist' },
          { id: 99, title: 'Another series' },
        ],
      };
    if (path === '/moviebox/episodes')
      return { seasons: [{ number: 1, name: 'Part 1', episodes: [{ number: 1 }] }] };
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
  await waitFor(() =>
    expect(
      (screen.getByRole('combobox', { name: 'Episode season' }) as HTMLSelectElement).value,
    ).toBe('1'),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Episode 1' }));
  expect(onSelect).toHaveBeenCalledWith('moviebox-source:71446:1:1');
});
