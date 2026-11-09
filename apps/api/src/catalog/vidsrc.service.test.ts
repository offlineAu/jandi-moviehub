import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/app-config';
import { VidsrcService } from './vidsrc.service';
const media = {
  provider: 'vidsrc' as const,
  type: 'movie' as const,
  movieId: '00000000-0000-4000-8000-000000000001',
  tmdbId: 155,
};
function setup(enabled = true) {
  const entries = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      entries.set(key, value);
      return 'OK';
    }),
  };
  return {
    redis,
    service: new VidsrcService(
      redis as unknown as Redis,
      { env: { ENABLE_VIDSRC_ROOM_SYNC: enabled } } as AppConfig,
    ),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('VidSrc listings', () => {
  it('validates identities, coalesces lookups and caches positive listings for five minutes', async () => {
    const { service, redis } = setup();
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ status_code: 200, type: 'movie', tmdb_id: '155' })),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await Promise.all([service.listed(media), service.listed(media)])).toEqual([true, true]);
    expect(await service.listed(media)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://vidsrc.sh/info/movie/155.json',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(redis.set).toHaveBeenCalledWith('vidsrc:listing:movie/155', '1', 'EX', 300);
    expect(service.embedUrl(media)).toBe('https://vidsrc.sh/embed/movie/155?autoplay=0&autonext=0');
  });
  it('caches 404 for one minute while temporary failures remain retryable', async () => {
    const { service, redis } = setup();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    await expect(service.listed(media)).rejects.toMatchObject({
      code: 'EXTERNAL_SOURCE_UNAVAILABLE',
    });
    expect(redis.set).not.toHaveBeenCalled();
    expect(await service.listed(media)).toBe(false);
    expect(redis.set).toHaveBeenCalledWith('vidsrc:listing:movie/155', '0', 'EX', 60);
  });
  it('rejects mismatched episodes and network timeouts without caching failures', async () => {
    const { service, redis } = setup();
    const tv = {
      provider: 'vidsrc' as const,
      type: 'tv' as const,
      tmdbId: 1399,
      tvId: 1399,
      season: 1,
      episode: 2,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 200,
            type: 'episode',
            tmdb_id: '1399',
            season: 1,
            episode: 3,
          }),
        ),
      )
      .mockRejectedValueOnce(new Error('timeout'));
    vi.stubGlobal('fetch', fetch);
    await expect(service.listed(tv)).rejects.toMatchObject({ code: 'EXTERNAL_SOURCE_UNAVAILABLE' });
    await expect(service.listed(tv)).rejects.toMatchObject({ code: 'EXTERNAL_SOURCE_UNAVAILABLE' });
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('defaults to a server enforced disabled feature', () => {
    expect(() => setup(false).service.assertEnabled()).toThrow(
      expect.objectContaining({ code: 'VIDSRC_SYNC_DISABLED' }),
    );
  });
});
