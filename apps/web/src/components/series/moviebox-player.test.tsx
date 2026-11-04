import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovieboxPlayer } from './moviebox-player';
import { apiFetch, ApiError } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MovieboxPlayer id="71446" season="2" episode="1" />
    </QueryClientProvider>,
  );
}
describe('MovieBox native playback', () => {
  it('requires a source episode for Season 1 and never requests nonexistent episode 14', async () => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({
        audioLanguage: 'es',
        sources: [{ id: '480', resolution: 480, url: '/api/v1/moviebox/media/test' }],
        englishVtt: null,
        subtitleStatus: 'UNAVAILABLE',
      });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MovieboxPlayer id="71446" season="1" episode="14" />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('status').textContent).toContain('Choose a MovieBox source episode');
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('MovieBox source part'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('MovieBox source episode'), { target: { value: '8' } });
    expect(await screen.findByLabelText('Original Spanish audio')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith('/moviebox/playback', {
      query: { tvId: '71446', season: '1', episode: '14', sourcePart: 2, sourceEpisode: 8 },
    });
    expect(screen.getByText(/Selected source:/).textContent).toContain('Part 2, Episode 8');
  });
  it('explains a missing API route and lets the user retry after restarting', async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(
        new ApiError({
          status: 404,
          code: 'HTTP_404',
          message: 'Cannot GET /api/v1/moviebox/playback',
        }),
      )
      .mockResolvedValueOnce({
        audioLanguage: 'es',
        sources: [
          { id: '480', resolution: 480, url: 'https://bcdnxw.hakunaymatata.com/example.mp4' },
        ],
        englishVtt: null,
        subtitleStatus: 'UNAVAILABLE',
      });
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain('Restart the API');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Original Spanish audio')).toBeTruthy();
  });
  it('attaches default English captions to the original-audio video and releases them on unmount', async () => {
    const create = vi.fn(() => 'blob:captions');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    vi.mocked(apiFetch).mockResolvedValue({
      audioLanguage: 'es',
      sources: [
        { id: '480', resolution: 480, url: 'https://bcdnxw.hakunaymatata.com/example.mp4' },
      ],
      englishVtt: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello',
      subtitleStatus: 'AVAILABLE',
    });
    const view = mount();
    const video = await screen.findByLabelText('Original Spanish audio');
    await waitFor(() =>
      expect(video.querySelector('track')?.getAttribute('src')).toBe('blob:captions'),
    );
    expect(video.querySelector('track')?.hasAttribute('default')).toBe(true);
    expect(video.getAttribute('src')).toContain('example.mp4');
    fireEvent.error(video);
    expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:captions');
    vi.unstubAllGlobals();
  });
  it('reports missing subtitles without claiming subtitle playback', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      audioLanguage: 'es',
      sources: [
        { id: '480', resolution: 480, url: 'https://bcdnxw.hakunaymatata.com/example.mp4' },
      ],
      englishVtt: null,
      subtitleStatus: 'UNAVAILABLE',
    });
    mount();
    expect(await screen.findByText(/English subtitles unavailable/)).toBeTruthy();
    expect(screen.getByLabelText('Original Spanish audio').querySelector('track')).toBeNull();
  });
});
