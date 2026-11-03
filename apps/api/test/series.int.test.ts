import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayableMovie, createUnplayableMovie } from './fixtures';
import { createTestApp, registerUser, resetState, type TestApp } from './helpers';
import { TvMetadataService } from '../src/catalog/tv.service';

describe('series and episodes', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
  });
  it('only streams explicitly linked episode media while its approved license remains valid', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const user = await registerUser(t);
    const movie = await createPlayableMovie(t.prisma);
    const unplayable = await createUnplayableMovie(t.prisma, 'Unavailable');
    const tv = t.app.get(TvMetadataService);
    const stub = vi.spyOn(tv, 'season').mockResolvedValue({
      season: { name: 'Season', overview: '', episodes: [{ number: 1 }] },
    } as Awaited<ReturnType<TvMetadataService['season']>>);
    const endpoint = '/api/v1/admin/tv/71446/seasons/1/episodes/1/media';
    const base = '/api/v1/tv/71446/seasons/1/episodes/1';
    try {
      await user.agent.put(endpoint).send({ movieId: movie.id, confirmed: true }).expect(403);
      await admin.agent.put(endpoint).send({ movieId: movie.id }).expect(400);
      await admin.agent.put(endpoint).send({ movieId: unplayable.id, confirmed: true }).expect(400);
      await admin.agent.put(endpoint).send({ movieId: movie.id, confirmed: true }).expect(200);
      expect(
        (await request(t.app.getHttpServer()).get(`${base}/availability`).expect(200)).body
          .playable,
      ).toBe(true);
      await request(t.app.getHttpServer()).get(`${base}/playback`).expect(401);
      const response = await user.agent.get(`${base}/playback`).expect(200);
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.body.sources.length).toBeGreaterThan(0);
      await t.prisma.mediaAsset.updateMany({
        where: { movieId: movie.id },
        data: { status: 'DISABLED' },
      });
      expect(
        (await request(t.app.getHttpServer()).get(`${base}/availability`).expect(200)).body
          .playable,
      ).toBe(false);
      await user.agent.get(`${base}/playback`).expect(404);
      await user.agent.delete(endpoint).expect(403);
      await admin.agent.delete(endpoint).expect(204);
      expect(
        await t.prisma.auditLog.count({
          where: {
            action: { in: ['admin.tv_episode.media.link', 'admin.tv_episode.media.unlink'] },
          },
        }),
      ).toBe(2);
    } finally {
      stub.mockRestore();
    }
  });
  it('records recent TV pages independently per user without creating playback history', async () => {
    const one = await registerUser(t);
    const two = await registerUser(t);
    const tv = t.app.get(TvMetadataService);
    const detail = vi.spyOn(tv, 'detail').mockResolvedValue({
      series: { id: 71446, title: 'Test series', posterUrl: null },
    } as Awaited<ReturnType<TvMetadataService['detail']>>);
    const season = vi.spyOn(tv, 'season').mockResolvedValue({
      season: { name: 'Season', overview: '', episodes: [{ number: 1 }] },
    } as Awaited<ReturnType<TvMetadataService['season']>>);
    try {
      await request(t.app.getHttpServer()).put('/api/v1/recent-tv/71446').send({}).expect(401);
      await one.agent.put('/api/v1/recent-tv/71446').send({ season: 1 }).expect(400);
      await one.agent.put('/api/v1/recent-tv/71446').send({ season: 1, episode: 9 }).expect(404);
      await one.agent.put('/api/v1/recent-tv/71446').send({ season: 1, episode: 1 }).expect(200);
      expect((await one.agent.get('/api/v1/recent-tv').expect(200)).body.items).toMatchObject([
        { tmdbId: 71446, season: 1, episode: 1 },
      ]);
      expect((await two.agent.get('/api/v1/recent-tv').expect(200)).body.items).toEqual([]);
      expect(await t.prisma.watchHistory.count({ where: { userId: one.id } })).toBe(0);
      await two.agent.delete('/api/v1/recent-tv/71446').expect(204);
      expect((await one.agent.get('/api/v1/recent-tv').expect(200)).body.items).toHaveLength(1);
      await one.agent.delete('/api/v1/recent-tv/71446').expect(204);
      expect((await one.agent.get('/api/v1/recent-tv').expect(200)).body.items).toHaveLength(0);
    } finally {
      detail.mockRestore();
      season.mockRestore();
    }
  });
  it('keeps saved TV series private and removes them without changing other accounts', async () => {
    const one = await registerUser(t);
    const two = await registerUser(t);
    const tv = t.app.get(TvMetadataService);
    const mock = vi.spyOn(tv, 'detail').mockResolvedValue({
      series: { id: 71446, title: 'Test series', posterUrl: null },
    } as Awaited<ReturnType<TvMetadataService['detail']>>);
    try {
      await request(t.app.getHttpServer()).put('/api/v1/saved-tv/71446').expect(401);
      await one.agent.put('/api/v1/saved-tv/71446').expect(200);
      await one.agent.put('/api/v1/saved-tv/71446').expect(200);
      expect((await one.agent.get('/api/v1/saved-tv').expect(200)).body.items).toHaveLength(1);
      expect((await two.agent.get('/api/v1/saved-tv').expect(200)).body.items).toHaveLength(0);
      await two.agent.delete('/api/v1/saved-tv/71446').expect(204);
      expect((await one.agent.get('/api/v1/saved-tv').expect(200)).body.items).toHaveLength(1);
      await one.agent.delete('/api/v1/saved-tv/71446').expect(204);
      expect((await one.agent.get('/api/v1/saved-tv').expect(200)).body.items).toHaveLength(0);
    } finally {
      mock.mockRestore();
    }
  });
  it('reports disabled external metadata and availability without inventing results', async () => {
    const server = request(t.app.getHttpServer());
    const tv = await server.get('/api/v1/tv/search?q=Money%20Heist').expect(503);
    expect(tv.body.error.code).toBe('TV_METADATA_NOT_CONFIGURED');
    const availability = await server.get('/api/v1/availability/tv/71446?region=PH').expect(503);
    expect(availability.body.error.code).toBe('AVAILABILITY_NOT_CONFIGURED');
    await server.get('/api/v1/availability/tv/71446?region=invalid').expect(400);
  });
  it('creates a private ordered series playlist that can be used in marathons', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const user = await registerUser(t);
    const other = await registerUser(t);
    const series = (
      await admin.agent.post('/api/v1/admin/series').send({ title: 'Ordered series' }).expect(201)
    ).body.series;
    await user.agent.post(`/api/v1/playlists/from-series/${series.id}`).expect(400);
    const first = await createPlayableMovie(t.prisma, { title: 'First' });
    const second = await createUnplayableMovie(t.prisma, 'Second');
    for (const [movieId, episodeNumber] of [
      [second.id, 2],
      [first.id, 1],
    ] as const) {
      await admin.agent
        .post(`/api/v1/admin/series/${series.id}/episodes`)
        .send({ movieId, seasonNumber: 1, episodeNumber })
        .expect(201);
    }
    await request(t.app.getHttpServer())
      .post(`/api/v1/playlists/from-series/${series.id}`)
      .expect(401);
    const playlist = (
      await user.agent.post(`/api/v1/playlists/from-series/${series.id}`).expect(201)
    ).body.playlist;
    expect(playlist.visibility).toBe('PRIVATE');
    expect(
      playlist.items.map((item: { movie: { id: string; playable: boolean } }) => item.movie),
    ).toMatchObject([
      { id: first.id, playable: true },
      { id: second.id, playable: false },
    ]);
    await other.agent.get(`/api/v1/playlists/${playlist.id}`).expect(404);
  });
  it('limits creation to admins and exposes ordered episodes with current license availability', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const user = await registerUser(t);
    await user.agent.get('/api/v1/admin/source-candidates/commons?q=bunny').expect(403);
    await user.agent.post('/api/v1/admin/series').send({ title: 'Drama' }).expect(403);
    const series = (
      await admin.agent
        .post('/api/v1/admin/series')
        .send({ title: 'Moonlight Drama', country: 'Korea' })
        .expect(201)
    ).body.series;
    const playable = await createPlayableMovie(t.prisma, { title: 'Episode 2' });
    const blocked = await createUnplayableMovie(t.prisma, 'Episode 1');
    await t.prisma.movie.update({
      where: { id: playable.id },
      data: { originalLanguage: 'ko', releaseDate: new Date('2020-04-01T00:00:00Z') },
    });
    const genre = await t.prisma.genre.create({ data: { name: 'Drama', slug: 'drama' } });
    await t.prisma.movieGenre.create({ data: { movieId: playable.id, genreId: genre.id } });
    await user.agent
      .post(`/api/v1/admin/series/${series.id}/episodes`)
      .send({ movieId: playable.id, seasonNumber: 1, episodeNumber: 2 })
      .expect(403);
    await admin.agent
      .post(`/api/v1/admin/series/${series.id}/episodes`)
      .send({ movieId: playable.id, seasonNumber: 1, episodeNumber: 2 })
      .expect(201);
    await admin.agent
      .post(`/api/v1/admin/series/${series.id}/episodes`)
      .send({ movieId: blocked.id, seasonNumber: 1, episodeNumber: 1 })
      .expect(201);
    await admin.agent
      .post(`/api/v1/admin/series/${series.id}/episodes`)
      .send({ movieId: playable.id, seasonNumber: 1, episodeNumber: 1 })
      .expect(409);
    const detail = await request(t.app.getHttpServer())
      .get(`/api/v1/series/${series.id}`)
      .expect(200);
    expect(
      detail.body.series.episodes.map(
        (e: { movie: { title: string; playable: boolean } }) => e.movie,
      ),
    ).toMatchObject([
      { title: 'Episode 1', playable: false },
      { title: 'Episode 2', playable: true },
    ]);
    const navigation = await request(t.app.getHttpServer())
      .get(`/api/v1/movies/${blocked.id}/series-navigation`)
      .expect(200);
    expect(navigation.body.navigation.next).toMatchObject({ movieId: playable.id, playable: true });
    const list = await request(t.app.getHttpServer()).get('/api/v1/series?q=moonlight').expect(200);
    expect(list.body.items).toMatchObject([{ id: series.id, episodeCount: 2 }]);
    const country = await request(t.app.getHttpServer())
      .get('/api/v1/series?country=korea')
      .expect(200);
    expect(country.body.items).toHaveLength(1);
    const otherCountry = await request(t.app.getHttpServer())
      .get('/api/v1/series?country=Japan')
      .expect(200);
    expect(otherCountry.body.items).toHaveLength(0);
    const filters = await request(t.app.getHttpServer())
      .get('/api/v1/series?language=ko&genre=drama&year=2020')
      .expect(200);
    expect(filters.body.items).toHaveLength(1);
    const wrongYear = await request(t.app.getHttpServer())
      .get('/api/v1/series?language=ko&year=2021')
      .expect(200);
    expect(wrongYear.body.items).toHaveLength(0);
    expect(
      await t.prisma.auditLog.count({ where: { action: { startsWith: 'admin.series.' } } }),
    ).toBe(3);
    await t.prisma.mediaAsset.updateMany({
      where: { movieId: playable.id },
      data: { status: 'DISABLED' },
    });
    const updated = await request(t.app.getHttpServer())
      .get(`/api/v1/series/${series.id}`)
      .expect(200);
    expect(updated.body.series.episodes[1].movie.playable).toBe(false);
    const unavailable = await request(t.app.getHttpServer())
      .get(`/api/v1/movies/${blocked.id}/series-navigation`)
      .expect(200);
    expect(unavailable.body.navigation.next.playable).toBe(false);
  });

  it('allows audited edits and removal while preserving movie and media records', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const user = await registerUser(t);
    const series = (
      await admin.agent.post('/api/v1/admin/series').send({ title: 'Original' }).expect(201)
    ).body.series;
    const movie = await createPlayableMovie(t.prisma);
    const episode = (
      await admin.agent
        .post(`/api/v1/admin/series/${series.id}/episodes`)
        .send({ movieId: movie.id, seasonNumber: 1, episodeNumber: 1 })
        .expect(201)
    ).body.episode;
    await user.agent
      .patch(`/api/v1/admin/series/${series.id}`)
      .send({ title: 'Forbidden' })
      .expect(403);
    await user.agent.delete(`/api/v1/admin/series/${series.id}/episodes/${episode.id}`).expect(403);
    await user.agent
      .patch(`/api/v1/admin/series/${series.id}/episodes/${episode.id}`)
      .send({ seasonNumber: 2, episodeNumber: 3 })
      .expect(403);
    await admin.agent
      .patch(`/api/v1/admin/series/${series.id}/episodes/${episode.id}`)
      .send({ seasonNumber: 2, episodeNumber: 3 })
      .expect(200);
    expect(
      await t.prisma.seriesEpisode.findUniqueOrThrow({ where: { id: episode.id } }),
    ).toMatchObject({ seasonNumber: 2, episodeNumber: 3 });
    await admin.agent
      .patch(`/api/v1/admin/series/${series.id}`)
      .send({ title: 'Updated', country: 'Korea' })
      .expect(200);
    await admin.agent.patch(`/api/v1/admin/series/${series.id}`).send({}).expect(400);
    await admin.agent
      .delete(`/api/v1/admin/series/${series.id}/episodes/${episode.id}`)
      .expect(204);
    expect(await t.prisma.movie.findUnique({ where: { id: movie.id } })).not.toBeNull();
    expect(await t.prisma.mediaAsset.count({ where: { movieId: movie.id } })).toBe(1);
    await admin.agent
      .delete(`/api/v1/admin/series/${series.id}/episodes/${episode.id}`)
      .expect(404);
    await admin.agent
      .post(`/api/v1/admin/series/${series.id}/episodes`)
      .send({ movieId: movie.id, seasonNumber: 1, episodeNumber: 1 })
      .expect(201);
    await admin.agent.delete(`/api/v1/admin/series/${series.id}`).expect(204);
    expect(await t.prisma.movie.findUnique({ where: { id: movie.id } })).not.toBeNull();
    expect(await t.prisma.mediaAsset.count({ where: { movieId: movie.id } })).toBe(1);
    for (const action of [
      'admin.series.update',
      'admin.series.episode.update',
      'admin.series.episode.remove',
      'admin.series.delete',
    ]) {
      expect(await t.prisma.auditLog.count({ where: { action } })).toBe(1);
    }
  });

  it('stores Commons candidates once, requires admin access and does not create playable media', async () => {
    const admin = await registerUser(t, { role: 'ADMIN' });
    const user = await registerUser(t);
    await user.agent
      .post('/api/v1/admin/source-candidates/commons')
      .send({ pageId: 123 })
      .expect(403);
    await user.agent.get('/api/v1/admin/source-candidates').expect(403);
    const response = {
      query: {
        pages: [
          {
            pageid: 123,
            title: 'File:Sample.webm',
            imageinfo: [
              {
                mime: 'video/webm',
                size: 100,
                extmetadata: {
                  LicenseShortName: { value: 'CC BY 3.0' },
                  Artist: { value: 'Example' },
                },
              },
            ],
          },
        ],
      },
    };
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(response), { status: 200 }));
    try {
      const [first, second] = await Promise.all([
        admin.agent.post('/api/v1/admin/source-candidates/commons').send({ pageId: 123 }),
        admin.agent.post('/api/v1/admin/source-candidates/commons').send({ pageId: 123 }),
      ]);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect([first.body.created, second.body.created].sort()).toEqual([false, true]);
      const queue = await admin.agent.get('/api/v1/admin/source-candidates').expect(200);
      expect(queue.body.items).toMatchObject([
        { externalId: '123', title: 'Sample.webm', license: 'CC BY 3.0' },
      ]);
      expect(await t.prisma.sourceCandidate.count()).toBe(1);
      expect(await t.prisma.movie.count()).toBe(0);
      expect(await t.prisma.mediaAsset.count()).toBe(0);
      expect(
        await t.prisma.auditLog.count({ where: { action: 'admin.source_candidate.add' } }),
      ).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(2);
      const candidateId = queue.body.items[0].id as string;
      await user.agent.delete(`/api/v1/admin/source-candidates/${candidateId}`).expect(403);
      await admin.agent.delete(`/api/v1/admin/source-candidates/${candidateId}`).expect(204);
      expect(await t.prisma.sourceCandidate.count()).toBe(0);
      expect(
        await t.prisma.auditLog.count({ where: { action: 'admin.source_candidate.remove' } }),
      ).toBe(1);
    } finally {
      fetcher.mockRestore();
    }
  });
});
