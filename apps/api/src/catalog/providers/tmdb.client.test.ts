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
    expect([...cache.store.keys()][0]).toBe('tmdb:v1:/movie/popular?page=1');
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

  it('requires credentials', () => {
    expect(() => new TmdbClient({ cacheTtlSec: 60, cache: memoryCache() })).toThrow();
  });
});
