import { afterEach, describe, expect, it, vi } from 'vitest';
import { KisskhStreamService } from './kisskh-stream.service';
import type { AppConfig } from '../config/app-config';

const episode = {
  provider: 'kisskh-direct' as const,
  tvId: '71446' as const,
  season: 1,
  episode: 3,
  numbering: 'provider' as const,
  seriesId: 2510,
  episodeId: 57283,
};
const service = (enabled = true, fallback?: string) =>
  new KisskhStreamService(
    {
      env: {
        ENABLE_KISSKH_DIRECT_SYNC: enabled,
        KISSKH_STREAM_RESOLVER_URL: 'https://resolver.example',
        KISSKH_STREAM_RESOLVER_FALLBACK_URL: fallback,
      },
    } as unknown as AppConfig,
    {} as never,
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('KissKH direct stream resolution', () => {
  it('falls back to a second resolver when the primary is unavailable', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('https://backup.example/')
        ? Response.json({ streams: [{ name: 'kisskh', url: 'https://cdn.example/right.m3u8' }] })
        : new Response('', { status: 503 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = service(true, 'https://backup.example').resolveMovie(672);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject({ format: 'HLS', url: 'https://cdn.example/right.m3u8' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('avoids contacting the backup when the primary succeeds quickly', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () =>
      Response.json({ streams: [{ name: 'kisskh', url: 'https://cdn.example/a.m3u8' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await service(true, 'https://backup.example').resolveMovie(672);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('distinguishes no matching source from an outage in one of the resolvers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('https://backup.example/')
        ? new Response('', { status: 503 })
        : Response.json({ streams: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = service(true, 'https://backup.example').resolveMovie(672);
    const outcome = expect(pending).rejects.toMatchObject({ code: 'KISSKH_DIRECT_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(3000);
    await outcome;
  });
  it('offers only approved KissKH subtitle tracks and converts them to WebVTT', async () => {
    const cache = new Map<string, string>();
    const redis = {
      set: vi.fn(async (key: string, value: string) => {
        cache.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => cache.get(key) ?? null),
    };
    const resolver = new KisskhStreamService(
      {
        env: {
          ENABLE_KISSKH_DIRECT_SYNC: true,
          KISSKH_STREAM_RESOLVER_URL: 'https://resolver.example',
        },
      } as unknown as AppConfig,
      redis as never,
    );
    const fetchMock = vi.fn(async (input: string | URL) =>
      String(input).includes('/subtitles/')
        ? Response.json({
            subtitles: [
              {
                id: 'kisskh-0',
                lang: 'eng',
                url: 'https://sub.cdnvideo11.shop/english.srt?sig=secret',
              },
              { id: 'kisskh-1', lang: 'eng', url: 'https://evil.example/captions.srt' },
              { id: 'other-0', lang: 'eng', url: 'https://sub.cdnvideo11.shop/other.srt' },
            ],
          })
        : new Response('1\n00:00:01,000 --> 00:00:02,000\nHello\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const tracks = await resolver.captions('movie', 'tmdb:672');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ lang: 'eng', label: 'English' });
    expect(tracks[0]!.url).not.toContain('secret');
    const token = tracks[0]!.url.split('/').at(-1)!;
    expect(await resolver.caption(token)).toContain('00:00:01.000 --> 00:00:02.000');
    await expect(resolver.caption('invalid')).rejects.toMatchObject({ status: 404 });
  });
  it('uses backup subtitle listings when the primary is unavailable', async () => {
    const redis = { set: vi.fn(async () => 'OK') };
    const resolver = new KisskhStreamService(
      {
        env: {
          ENABLE_KISSKH_DIRECT_SYNC: true,
          KISSKH_STREAM_RESOLVER_URL: 'https://resolver.example',
          KISSKH_STREAM_RESOLVER_FALLBACK_URL: 'https://backup.example',
        },
      } as unknown as AppConfig,
      redis as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('https://backup.example/')
          ? Response.json({
              subtitles: [
                { id: 'kisskh-0', lang: 'eng', url: 'https://sub.cdnvideo11.shop/english.srt' },
              ],
            })
          : new Response('', { status: 503 }),
      ),
    );
    expect(await resolver.captions('movie', 'tmdb:672')).toHaveLength(1);
  });
  it('combines KissKH tracks from both resolvers and excludes alternate providers', async () => {
    const cache = new Map<string, string>();
    const redis = {
      set: vi.fn(async (key: string, value: string) => {
        cache.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => cache.get(key) ?? null),
    };
    const resolver = new KisskhStreamService(
      {
        env: {
          ENABLE_KISSKH_DIRECT_SYNC: true,
          KISSKH_STREAM_RESOLVER_URL: 'https://resolver.example',
          KISSKH_STREAM_RESOLVER_FALLBACK_URL: 'https://backup.example',
        },
      } as unknown as AppConfig,
      redis as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.startsWith('https://resolver.example/'))
          return Response.json({
            subtitles: [
              { id: 'kisskh:2512', lang: 'khm', url: 'https://sub.cdnvideo11.shop/khmer.srt' },
              {
                id: 'onetouchtv-eng-0',
                lang: 'eng',
                url: 'https://aapanel.devcorp.me/assets/english.vtt',
              },
              { id: 'onetouchtv-eng-1', lang: 'eng', url: 'https://evil.example/english.vtt' },
            ],
          });
        if (url.startsWith('https://backup.example/'))
          return Response.json({
            subtitles: [
              { id: 'kisskh:2512', lang: 'eng', url: 'https://sub.cdnvideo11.shop/english.srt' },
              {
                id: 'onetouchtv-eng-2',
                lang: 'eng',
                url: 'https://aapanel.devcorp.me/assets/english.vtt',
              },
            ],
          });
        return new Response('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n');
      }),
    );
    const tracks = await resolver.captions('series', 'kisskh:2512:1:2');
    expect(tracks.map((track) => track.label)).toEqual(['Khmer', 'English']);
    expect(await resolver.caption(tracks[1]!.url.split('/').at(-1)!)).toContain(
      '00:00:01.000 --> 00:00:02.000',
    );
    expect(cache.size).toBe(2);
  });
  it('allows a cold subtitle resolver enough time to return tracks', async () => {
    vi.useFakeTimers();
    const redis = { set: vi.fn(async () => 'OK') };
    const resolver = new KisskhStreamService(
      {
        env: {
          ENABLE_KISSKH_DIRECT_SYNC: true,
          KISSKH_STREAM_RESOLVER_URL: 'https://resolver.example',
        },
      } as unknown as AppConfig,
      redis as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
            setTimeout(
              () =>
                resolve(
                  Response.json({
                    subtitles: [
                      {
                        id: 'kisskh-0',
                        lang: 'eng',
                        url: 'https://sub.cdnvideo11.shop/english.srt',
                      },
                    ],
                  }),
                ),
              30000,
            );
          }),
      ),
    );
    const pending = resolver.captions('movie', 'tmdb:672');
    await vi.advanceTimersByTimeAsync(30000);
    expect(await pending).toHaveLength(1);
  });
  it('requests movies using their TMDB identity', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({ streams: [{ name: 'kisskh', url: 'https://cdn.example/movie.m3u8' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect((await service().resolveMovie(672)).format).toBe('HLS');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://resolver.example/stream/movie/tmdb%3A672.json',
    );
  });
  it('requests the selected provider series and episode and picks the KissKH stream', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({
        streams: [
          { name: 'Other', url: 'https://cdn.example/wrong.m3u8' },
          { name: 'yastream\nkisskh', url: 'https://cdn.example/episode.m3u8?sig=secret' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await service().resolve(episode)).toEqual({
      url: 'https://cdn.example/episode.m3u8?sig=secret',
      format: 'HLS',
      mimeType: 'application/vnd.apple.mpegurl',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://resolver.example/stream/series/kisskh%3A2510%3A1%3A3.json',
    );
  });
  it('does not make requests when disabled and refuses malformed or unrelated streams', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        streams: [
          { name: 'kisskh', url: 'http://cdn.example/episode.mp4' },
          { name: 'other', url: 'https://cdn.example/episode.mp4' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(service(false).resolve(episode)).rejects.toMatchObject({
      code: 'KISSKH_DIRECT_DISABLED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(service().resolve(episode)).rejects.toMatchObject({
      code: 'KISSKH_DIRECT_NO_STREAM',
    });
  });
  it('does not expose resolver response details on upstream failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('secret', { status: 503 })),
    );
    await expect(service().resolve(episode)).rejects.toMatchObject({
      code: 'KISSKH_DIRECT_UNAVAILABLE',
    });
  });
  it('allows an idle resolver to start and shares the pending request among viewers', async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    const fetchMock = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
          setTimeout(
            () =>
              resolve(
                Response.json({ streams: [{ name: 'kisskh', url: 'https://cdn.example/e.m3u8' }] }),
              ),
            30000,
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const resolver = service();
    const first = resolver.resolve(episode);
    const second = resolver.resolve(episode);
    await vi.advanceTimersByTimeAsync(30000);
    expect((await first).format).toBe('HLS');
    expect(await second).toEqual(await first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('starts only one warm-up while multiple pickers are open', async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(
      (_url: string) =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const resolver = service();
    resolver.warm();
    resolver.warm();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://resolver.example/manifest.json');
    finish(new Response(null, { status: 200 }));
    await vi.waitFor(() => {
      resolver.warm();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    finish(new Response(null, { status: 200 }));
  });
});
