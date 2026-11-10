import { expect, it, vi } from 'vitest';
import { RealtimeController } from './realtime.controller';

it('resolves a fresh direct movie stream only after checking room membership', async () => {
  const media = {
    provider: 'kisskh-direct' as const,
    type: 'movie' as const,
    movieId: '00000000-0000-4000-8000-000000000001',
    tmdbId: 672,
  };
  const rooms = { requireMember: vi.fn(async () => {}) };
  const playback = { getState: vi.fn(async () => ({ externalMedia: media })) };
  const catalog = { getSummary: vi.fn(async () => ({ title: 'Chamber of Secrets' })) };
  const streams = {
    resolveMovie: vi.fn(async () => ({
      url: 'https://cdn.example/movie.m3u8',
      format: 'HLS',
      mimeType: 'application/vnd.apple.mpegurl',
    })),
  };
  const controller = new RealtimeController(
    rooms as never,
    playback as never,
    catalog as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    streams as never,
  );
  const result = await controller.sources({ id: 'viewer' } as never, 'room');
  expect(rooms.requireMember).toHaveBeenCalledWith('room', 'viewer');
  expect(streams.resolveMovie).toHaveBeenCalledWith(672);
  expect(result.sources).toEqual([
    expect.objectContaining({
      assetId: `kisskh-direct:movie:${media.movieId}`,
      url: 'https://cdn.example/movie.m3u8',
    }),
  ]);
});
