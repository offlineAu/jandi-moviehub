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
    captions: vi.fn(async () => []),
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
    {} as never,
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

it('refreshes captions for the current episode without resolving the stream', async () => {
  const episode = {
    provider: 'kisskh-direct' as const,
    tvId: '71446' as const,
    season: 4,
    episode: 1,
    seriesId: 2513,
    episodeId: 57306,
    numbering: 'provider' as const,
  };
  const rooms = { requireMember: vi.fn(async () => {}) };
  const playback = { getState: vi.fn(async () => ({ tvEpisode: episode })) };
  const streams = {
    captions: vi.fn(async () => [{ lang: 'eng', label: 'English', url: '/captions/token' }]),
    resolve: vi.fn(),
  };
  const controller = new RealtimeController(
    rooms as never,
    playback as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    streams as never,
    {} as never,
  );
  expect(await controller.captions({ id: 'viewer' } as never, 'room')).toEqual({
    assetId: 'kisskh-direct:71446:4:1:2513:57306',
    captions: [{ lang: 'eng', label: 'English', url: '/captions/token' }],
  });
  expect(rooms.requireMember).toHaveBeenCalledWith('room', 'viewer');
  expect(streams.captions).toHaveBeenCalledWith('series', 'kisskh:2513:1:1');
  expect(streams.resolve).not.toHaveBeenCalled();
});

it('returns the episode stream and recovered captions together in one playback response', async () => {
  const { KisskhStreamService } = await import('../catalog/kisskh-stream.service');
  const episode = {
    provider: 'kisskh-direct' as const,
    tvId: '71446' as const,
    season: 4,
    episode: 1,
    seriesId: 2513,
    episodeId: 57306,
    numbering: 'provider' as const,
  };
  const cache = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => cache.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      cache.set(key, value);
      return 'OK';
    }),
  };
  const streams = new KisskhStreamService(
    {
      env: {
        ENABLE_KISSKH_DIRECT_SYNC: true,
        KISSKH_STREAM_RESOLVER_URL: 'https://resolver.example',
      },
    } as never,
    redis as never,
  );
  let captionCalls = 0;
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes('/subtitles/')) {
      captionCalls++;
      return Response.json({
        subtitles:
          captionCalls === 1
            ? []
            : [{ id: 'kisskh-0', lang: 'eng', url: 'https://sub.cdnvideo11.shop/sub/english.srt' }],
      });
    }
    return Response.json({
      streams: [{ name: 'kisskh', url: 'https://cdn.example/episode.m3u8' }],
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  try {
    const controller = new RealtimeController(
      { requireMember: vi.fn(async () => {}) } as never,
      { getState: vi.fn(async () => ({ tvEpisode: episode })) } as never,
      {} as never,
      {} as never,
      { detail: vi.fn(async () => ({ series: {} })) } as never,
      { resolveRoomEpisode: vi.fn(async () => ({ series: { title: 'Money Heist' } })) } as never,
      {} as never,
      streams,
      {} as never,
    );
    const result = await controller.sources({ id: 'viewer' } as never, 'room');
    expect(result.sources).toEqual([
      expect.objectContaining({
        assetId: 'kisskh-direct:71446:4:1:2513:57306',
        url: 'https://cdn.example/episode.m3u8',
        captions: [
          expect.objectContaining({
            lang: 'eng',
            label: 'English',
            url: expect.stringMatching(/^\/api\/v1\/room-sources\/kisskh\/captions\//),
          }),
        ],
      }),
    ]);
    expect(captionCalls).toBe(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
