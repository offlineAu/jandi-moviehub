import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExternalEpisodes } from './external-episodes';
import { apiFetch, ApiError } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));
describe('external episode lookup recovery', () => {
  it.each(['search', 'detail'])(
    'retries a failed %s lookup and selects the episode',
    async (stage) => {
      const failure = new ApiError({
        status: 503,
        code: 'EXTERNAL_SOURCE_UNAVAILABLE',
        message: 'The external series catalog is unavailable.',
      });
      const search = { items: [{ id: 2510, title: 'Money Heist - Season 1' }] };
      const detail = {
        series: { id: 2510, title: 'Money Heist - Season 1', episodes: [{ id: 57281, number: 1 }] },
      };
      const fetch = vi.mocked(apiFetch);
      fetch.mockReset();
      if (stage === 'search')
        fetch
          .mockRejectedValueOnce(failure)
          .mockResolvedValueOnce(search)
          .mockResolvedValueOnce(detail);
      else
        fetch
          .mockResolvedValueOnce(search)
          .mockRejectedValueOnce(failure)
          .mockResolvedValueOnce(detail);
      const onPlayerChange = vi.fn();
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <ExternalEpisodes
            title="Money Heist"
            season={1}
            episode={1}
            onPlayerChange={onPlayerChange}
            onStatusChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        expect.stringContaining(failure.message),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() =>
        expect(onPlayerChange).toHaveBeenCalledWith({
          id: 57281,
          title: 'Money Heist - Season 1 episode 1',
        }),
      );
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );
});
