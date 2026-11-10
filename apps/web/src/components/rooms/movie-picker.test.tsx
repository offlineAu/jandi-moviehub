import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MoviePicker } from './movie-picker';

const mocks = vi.hoisted(() => ({ check: vi.fn(), onChange: vi.fn() }));
vi.mock('@/lib/queries/room-sources', () => ({
  useRoomSourceCapabilities: () => ({ data: { kisskhDirectSync: true } }),
  useRoomSourceCheck: () => ({ refetch: mocks.check }),
}));
vi.mock('@/lib/queries/catalog', () => ({
  useMovie: () => ({}),
  useMovies: () => ({
    data: {
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          title: 'Chamber of Secrets',
          playable: false,
        },
      ],
    },
  }),
}));
vi.mock('./tv-room-picker', () => ({ TvRoomPicker: () => null, SelectedRoomEpisode: () => null }));
vi.mock('@/components/movies/artwork', () => ({ Artwork: () => null }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(async () => ({})) }));

it('checks the selected movie before offering it for synchronized playback', async () => {
  mocks.check.mockResolvedValueOnce({ data: { listed: true } });
  render(<MoviePicker value={undefined} onChange={mocks.onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /Chamber of Secrets/ }));
  await waitFor(() =>
    expect(mocks.onChange).toHaveBeenCalledWith(
      'kisskh-direct:movie:00000000-0000-4000-8000-000000000001',
    ),
  );
});
