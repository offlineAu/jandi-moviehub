import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { details, genreList, listPage } from '../src/catalog/providers/__fixtures__/tmdb';
import { ids, seedTestCatalog } from './catalog-fixtures';
import { createTestApp, resetState, type TestApp } from './helpers';

/**
 * TMDB mode end-to-end with `fetch` replaced by a router over hand-written fixtures —
 * no network access, and nothing here is presented as live data.
 */
describe('catalog (integration, TMDB provider with mocked fetch)', () => {
  let t: TestApp;
  const calls: string[] = [];
  let failPaths = new Set<string>();
  const http = () => request(t.app.getHttpServer());

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fakeFetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const path = url.pathname.replace(/^\/3/, '');
    calls.push(`${path}?${url.searchParams.toString()}`);
    if (failPaths.has(path)) return json({ status_message: 'Service unavailable' }, 503);
    const page = Number(url.searchParams.get('page') ?? 1);
    if (path === '/genre/movie/list') return json(genreList);
    if (
      ['/movie/popular', '/trending/movie/day', '/discover/movie', '/movie/top_rated'].includes(
        path,
      )
    )
      return json(listPage(page));
    const m = /^\/movie\/(\d+)$/.exec(path);
    if (m) return json({ ...details, id: Number(m[1]), title: `Detailed ${m[1]}` });
    return json({ status_message: 'not found' }, 404);
  });

  beforeAll(async () => {
    process.env.TMDB_READ_TOKEN = 'test-read-token';
    vi.stubGlobal('fetch', fakeFetch);
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
    vi.unstubAllGlobals();
    delete process.env.TMDB_READ_TOKEN;
  });
  beforeEach(async () => {
    await resetState(t);
    await seedTestCatalog(t);
    calls.length = 0;
    failPaths = new Set();
  });

  it('reports TMDB with the required attribution notice', async () => {
    const res = await http().get('/api/v1/catalog/info').expect(200);
    expect(res.body).toEqual({
      provider: 'tmdb',
      label: 'TMDB',
      attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      attributionUrl: 'https://www.themoviedb.org/',
    });
  });

  it('lists a curated category across TMDB pages, upserting titles with stable UUIDs, then serves from cache', async () => {
    const res = await http().get('/api/v1/movies?category=popular&pageSize=30').expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 30, total: 60, totalPages: 2 });
    expect(res.body.items).toHaveLength(30);
    expect(res.body.items[0]).toMatchObject({
      title: 'Fixture 1-0',
      source: 'TMDB',
      isDemo: false,
      playable: false,
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster1000.jpg',
      genres: ['Drama', 'Science Fiction'],
      releaseDate: '2024-05-17',
    });
    expect(res.body.items[20].title).toBe('Fixture 2-0');
    expect(calls.filter((c) => c.startsWith('/movie/popular'))).toHaveLength(2);
    const row = await t.prisma.movie.findUniqueOrThrow({ where: { tmdbId: 1000 } });
    expect(row.id).toBe(res.body.items[0].id);

    const before = fakeFetch.mock.calls.length;
    const again = await http().get('/api/v1/movies?category=popular&pageSize=30').expect(200);
    expect(fakeFetch.mock.calls.length).toBe(before);
    expect(again.body.items.map((m: { id: string }) => m.id)).toEqual(
      res.body.items.map((m: { id: string }) => m.id),
    );
  });

  it('routes trending and genre filters to the right endpoints', async () => {
    await http().get('/api/v1/movies?category=trending').expect(200);
    expect(calls.some((c) => c.startsWith('/trending/movie/day'))).toBe(true);
    await http().get('/api/v1/movies?genre=drama&sort=rating').expect(200);
    const discover = calls.find((c) => c.startsWith('/discover/movie'))!;
    expect(discover).toContain('with_genres=18');
    expect(discover).toContain('sort_by=vote_average.desc');
    expect((await http().get('/api/v1/movies?genre=not-a-genre').expect(200)).body).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('enriches details (runtime, cast, trailers) and resolves similar / recommendations', async () => {
    const list = await http().get('/api/v1/movies?category=popular&pageSize=1').expect(200);
    const id = list.body.items[0].id as string;
    const res = await http().get(`/api/v1/movies/${id}`).expect(200);
    expect(res.body.movie).toMatchObject({
      id,
      title: 'Detailed 1000',
      runtimeMin: 139,
      tagline: 'A tagline.',
      cast: [
        { name: 'Top Billed', character: 'Role A', profileUrl: null },
        {
          name: 'Second Billed',
          character: 'Role B',
          profileUrl: 'https://image.tmdb.org/t/p/w185/b.jpg',
        },
      ],
      trailers: [
        { site: 'YouTube', key: 'trailerKey1', name: 'Official Trailer' },
        { site: 'YouTube', key: 'teaserKey01', name: 'Teaser' },
      ],
      genres: ['Action', 'Drama'],
      attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      media: [],
      license: null,
    });
    expect(calls.find((c) => c.startsWith('/movie/1000'))).toContain(
      'append_to_response=credits%2Cvideos%2Csimilar%2Crecommendations',
    );
    const similar = await http().get(`/api/v1/movies/${id}/similar`).expect(200);
    expect(similar.body.items.map((m: { title: string }) => m.title)).toEqual(['Similar One']); // adult result filtered
    const recs = await http().get(`/api/v1/movies/${id}/recommendations`).expect(200);
    expect(recs.body.items.map((m: { title: string }) => m.title)).toEqual(['Recommended One']);
  });

  it('maps upstream failures to 502 UPSTREAM_UNAVAILABLE', async () => {
    failPaths.add('/movie/top_rated');
    const res = await http().get('/api/v1/movies?category=top-rated').expect(502);
    expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('serves playable titles and local originals from the database', async () => {
    const res = await http().get('/api/v1/movies?playable=true').expect(200);
    expect(res.body.items.map((m: { id: string }) => m.id)).toContain(ids.neonDrift);
    expect(res.body.items.every((m: { playable: boolean }) => m.playable)).toBe(true);
    const detail = await http().get(`/api/v1/movies/${ids.neonDrift}`).expect(200);
    expect(detail.body.movie).toMatchObject({ source: 'LOCAL', playable: true });
    const rec = await http().get(`/api/v1/movies/${ids.neonDrift}/recommendations`).expect(200);
    expect(rec.body.items.length).toBeGreaterThan(0);
  });
});
