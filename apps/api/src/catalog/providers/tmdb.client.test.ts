import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/errors';
import { listPage } from './__fixtures__/tmdb';
import { type TmdbCache, TmdbClient } from './tmdb.client';

function memoryCache(): TmdbCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => {
      store.set(k, v);
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('TmdbClient', () => {
  it('uses the bearer token, caches responses and never puts the token in the URL', async () => {
    const fetchImpl = vi.fn(async () => json(listPage(1)));
    const cache = memoryCache();
    const client = new TmdbClient({ readToken: 'read-token', cacheTtlSec: 60, cache, fetchImpl });
    const a = await client.get('/movie/popular', { page: 1 });
    const b = await client.get('/movie/popular', { page: 1 });
    expect(a).toEqual(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://api.themoviedb.org/3/movie/popular?page=1');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer read-token');
    expect([...cache.store.keys()][0]).toBe('tmdb:v2:/movie/popular?page=1');
  });

  it('falls back to the api_key query parameter (not part of the cache key)', async () => {
    const fetchImpl = vi.fn(async () => json(listPage(1)));
    const cache = memoryCache();
    const client = new TmdbClient({ apiKey: 'k123', cacheTtlSec: 60, cache, fetchImpl });
    await client.get('/search/movie', { query: 'alien', page: 2 });
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get('api_key')).toBe('k123');
    expect([...cache.store.keys()][0]).not.toContain('k123');
  });

  it.each([
    [401, 'UPSTREAM_UNAVAILABLE', 502],
    [429, 'UPSTREAM_UNAVAILABLE', 502],
    [500, 'UPSTREAM_UNAVAILABLE', 502],
    [404, 'NOT_FOUND', 404],
  ])('maps HTTP %i to %s', async (status, code, httpStatus) => {
    const client = new TmdbClient({
      readToken: 't',
      cacheTtlSec: 60,
      cache: memoryCache(),
      fetchImpl: async () => json({ status_message: 'x' }, status),
    });
    const err = await client.get('/movie/1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    expect((err as AppError).getStatus()).toBe(httpStatus);
  });

  it('maps timeouts and network errors to 502 and does not cache failures', async () => {
    const cache = memoryCache();
    const timeout = new TmdbClient({
      readToken: 't',
      cacheTtlSec: 60,
      cache,
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    });
    const err = await timeout.get('/movie/popular').catch((e: unknown) => e);
    expect((err as AppError).code).toBe('UPSTREAM_UNAVAILABLE');

    const network = new TmdbClient({
      readToken: 't',
      cacheTtlSec: 60,
      cache,
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(((await network.get('/x').catch((e: unknown) => e)) as AppError).getStatus()).toBe(502);
    expect(cache.store.size).toBe(0);
  });

  describe('stale-while-revalidate', () => {
    const freshFor = (
      cache: ReturnType<typeof memoryCache>,
      key: string,
      body: unknown,
      at: number,
    ) => cache.store.set(key, JSON.stringify({ at, body }));

    it('serves a stale entry immediately and refreshes it once in the background', async () => {
      const cache = memoryCache();
      const key = TmdbClient.cacheKey('/trending/movie/day', { page: 1 });
      freshFor(cache, key, { v: 'old' }, Date.now() - 61_000);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const fetchImpl = vi.fn(async () => {
        await gate;
        return json({ v: 'new' });
      });
      const client = new TmdbClient({ readToken: 't', cacheTtlSec: 60, cache, fetchImpl });

      expect(await client.get('/trending/movie/day', { page: 1 })).toEqual({ v: 'old' });
      expect(await client.get('/trending/movie/day', { page: 1 })).toEqual({ v: 'old' });
      expect(fetchImpl).toHaveBeenCalledTimes(1); // second stale read joins the same refresh

      release();
      await vi.waitFor(() => expect(JSON.parse(cache.store.get(key)!).body).toEqual({ v: 'new' }));
      expect(await client.get('/trending/movie/day', { page: 1 })).toEqual({ v: 'new' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('keeps serving the stale entry when the background refresh fails', async () => {
      const cache = memoryCache();
      const key = TmdbClient.cacheKey('/movie/popular', {});
      freshFor(cache, key, { v: 'old' }, Date.now() - 61_000);
      const fetchImpl = vi.fn(async () => json({}, 500));
      const client = new TmdbClient({ readToken: 't', cacheTtlSec: 60, cache, fetchImpl });
      expect(await client.get('/movie/popular')).toEqual({ v: 'old' });
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
      expect(JSON.parse(cache.store.get(key)!).body).toEqual({ v: 'old' });
    });

    it('does not refetch fresh entries', async () => {
      const cache = memoryCache();
      freshFor(cache, TmdbClient.cacheKey('/movie/popular', {}), { v: 'fresh' }, Date.now());
      const fetchImpl = vi.fn(async () => json({ v: 'new' }));
      const client = new TmdbClient({ readToken: 't', cacheTtlSec: 60, cache, fetchImpl });
      expect(await client.get('/movie/popular')).toEqual({ v: 'fresh' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('stores entries for the fresh + stale window', async () => {
      const set = vi.fn(async () => undefined);
      const client = new TmdbClient({
        readToken: 't',
        cacheTtlSec: 60,
        staleTtlSec: 600,
        cache: { get: async () => null, set },
        fetchImpl: async () => json({ ok: true }),
      });
      await client.get('/movie/popular');
      expect(set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 660);
    });

    it('treats unreadable cache entries as a miss', async () => {
      const cache = memoryCache();
      cache.store.set(TmdbClient.cacheKey('/movie/popular', {}), 'not json');
      const client = new TmdbClient({
        readToken: 't',
        cacheTtlSec: 60,
        cache,
        fetchImpl: async () => json({ v: 'new' }),
      });
      expect(await client.get('/movie/popular')).toEqual({ v: 'new' });
    });
  });

  it('shares one upstream request between concurrent misses for the same key', async () => {
    const fetchImpl = vi.fn(async () => json(listPage(1)));
    const client = new TmdbClient({
      readToken: 't',
      cacheTtlSec: 60,
      cache: memoryCache(),
      fetchImpl,
    });
    const [a, b] = await Promise.all([
      client.get('/movie/popular', { page: 1 }),
      client.get('/movie/popular', { page: 1 }),
    ]);
    expect(a).toEqual(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('requires credentials', () => {
    expect(() => new TmdbClient({ cacheTtlSec: 60, cache: memoryCache() })).toThrow();
  });
});
