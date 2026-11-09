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
const service = (enabled = true) =>
  new KisskhStreamService({
    env: {
      ENABLE_KISSKH_DIRECT_SYNC: enabled,
      KISSKH_STREAM_RESOLVER_URL: 'https://resolver.example',
    },
  } as unknown as AppConfig);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('KissKH direct stream resolution', () => {
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
