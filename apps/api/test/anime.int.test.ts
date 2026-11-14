import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppConfig } from '../src/config/app-config';
import { createTestApp, registerUser, resetState, type TestApp } from './helpers';

describe('anime catalog and episode navigation', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    const config = t.app.get(AppConfig);
    config.env.ENABLE_ANIME = true;
    config.env.ANIME_ADAPTERS_JSON = JSON.stringify([
      {
        id: 'test',
        family: 'test',
        baseUrl: 'https://resolver.example',
        mediaHosts: ['cdn.example'],
        enabled: true,
      },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
  });

  it('exposes only reviewed sources and navigates to a compatible episode', async () => {
    const title = await t.prisma.animeTitle.create({
      data: {
        catalogKey: 'test',
        title: 'Test Anime',
        aliases: ['alternative'],
        format: 'TV',
        externalIds: {},
        provenance: 'test',
      },
    });
    const episode1 = await t.prisma.animeEpisode.create({
      data: { animeId: title.id, key: '1', label: 'Episode 1', ordinal: 1 },
    });
    const episode2 = await t.prisma.animeEpisode.create({
      data: { animeId: title.id, key: '2', label: 'Episode 2', ordinal: 2 },
    });
    const source = (episodeId: string, providerId: string, verified: boolean) => ({
      episodeId,
      providerId,
      adapterId: 'test',
      streamName: 'Japanese',
      edition: 'sub',
      audioLanguage: 'ja',
      evidence: 'reviewed',
      enabled: true,
      verified,
    });
    const first = await t.prisma.animeSource.create({ data: source(episode1.id, 'one', true) });
    const second = await t.prisma.animeSource.create({ data: source(episode2.id, 'two', true) });
    const unreviewed = await t.prisma.animeSource.create({
      data: source(episode1.id, 'unreviewed', false),
    });
    const http = request(t.app.getHttpServer());
    expect((await http.get('/api/v1/anime?q=alternative').expect(200)).body.items).toHaveLength(1);
    const episodes = (await http.get(`/api/v1/anime/${title.id}/episodes`).expect(200)).body
      .episodes;
    expect(episodes[0].sources.map((s: { id: string }) => s.id)).toEqual([first.id]);
    await http.get(`/api/v1/anime/sources/${first.id}/navigation`).expect(401);
    const user = await registerUser(t);
    expect(
      (await user.agent.get(`/api/v1/anime/sources/${first.id}/navigation`).expect(200)).body.next,
    ).toEqual({ sourceId: second.id, label: 'Episode 2' });
    await user.agent.get(`/api/v1/anime/sources/${unreviewed.id}`).expect(404);
  });
});
