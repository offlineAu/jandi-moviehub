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
vi.mock('./tv-room-picker', () => ({
  TvRoomPicker: (props: { query: string; initialSelection?: string }) => (
    <div
      data-testid="series-picker"
      data-query={props.query}
      data-selection={props.initialSelection}
    />
  ),
  SelectedRoomEpisode: () => null,
}));
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

it('opens the title picker searching the current series with its episode identity', () => {
  render(
    <MoviePicker
      value="moviebox-source:71446:5:2"
      onChange={mocks.onChange}
      initialSelection="moviebox-source:71446:5:2"
      initialTitle="Money Heist · Part 5, Episode 2"
    />,
  );
  expect(
    (
      screen.getByRole('searchbox', {
        name: 'Search movies or series to watch',
      }) as HTMLInputElement
    ).value,
  ).toBe('Money Heist');
  expect(screen.getByTestId('series-picker').getAttribute('data-selection')).toBe(
    'moviebox-source:71446:5:2',
  );
  expect(screen.getByTestId('series-picker').getAttribute('data-query')).toBe('Money Heist');
});
