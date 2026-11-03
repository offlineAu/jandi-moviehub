import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedCatalog, seedDemoUsers } from '../prisma/seed';
import { CatalogService } from '../src/catalog/catalog.service';
import { AppConfig } from '../src/config/app-config';
import { ids, seedTestCatalog } from './catalog-fixtures';
import { createGuest, createTestApp, registerUser, resetState, type TestApp } from './helpers';

describe('catalog (integration, local provider)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
    await seedTestCatalog(t);
  });

  it('reports the local demo provider', async () => {
    const res = await http().get('/api/v1/catalog/info').expect(200);
    expect(res.body).toMatchObject({ provider: 'local', label: 'Demo catalog' });
  });

  it('lists genres that have titles', async () => {
    const res = await http().get('/api/v1/genres').expect(200);
    const slugs = res.body.items.map((g: { slug: string }) => g.slug);
    expect(slugs).toContain('horror');
    expect(slugs).not.toContain('western');
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      slug: expect.any(String),
    });
  });

  it('paginates movies with summary DTOs and playable flags', async () => {
    const res = await http().get('/api/v1/movies?pageSize=5&page=1').expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 5, total: 14, totalPages: 3 });
    expect(res.body.items).toHaveLength(5);
    const first = res.body.items[0];
    expect(first).toEqual({
      id: ids.neonDrift,
      title: 'Neon Drift',
      year: 2026,
      releaseDate: '2026-10-30',
      overview: expect.any(String),
      posterUrl: '/api/v1/catalog/artwork/neon-drift-poster.svg',
      backdropUrl: '/api/v1/catalog/artwork/neon-drift-backdrop.svg',
      voteAverage: null,
      runtimeMin: 2,
      genres: ['Science Fiction', 'Thriller'],
      playable: true,
      isDemo: true,
      source: 'LOCAL',
    });
    const all = await http().get('/api/v1/movies?pageSize=50').expect(200);
    const playable = all.body.items
      .filter((m: { playable: boolean }) => m.playable)
      .map((m: { id: string }) => m.id);
    expect(playable.sort()).toEqual(
      [ids.neonDrift, ids.projectionist, ids.courier, ids.sunrise].sort(),
    );
    expect(all.body.items.find((m: { id: string }) => m.id === ids.bunny)).toMatchObject({
      isDemo: false,
      playable: false,
    });
  });

  it('filters by genre, text, year, playability and sorts', async () => {
    const horror = await http().get('/api/v1/movies?genre=horror&pageSize=50').expect(200);
    expect(horror.body.items.map((m: { title: string }) => m.title).sort()).toEqual(
      ['Night of the Living Dead', 'Nosferatu', 'The Cabinet of Dr. Caligari'].sort(),
    );
    const q = await http().get('/api/v1/movies?q=symphonie').expect(200); // matches original title
    expect(q.body.items.map((m: { id: string }) => m.id)).toEqual([ids.nosferatu]);
    const year = await http().get('/api/v1/movies?year=1968').expect(200);
    expect(year.body.items.map((m: { id: string }) => m.id)).toEqual([ids.notld]);
    const playable = await http().get('/api/v1/movies?playable=true&sort=title').expect(200);
    expect(playable.body.items.map((m: { title: string }) => m.title)).toEqual([
      'Neon Drift',
      'Paper Moon Courier',
      'The Last Projectionist',
      'Twenty Second Sunrise',
    ]);
    const release = await http().get('/api/v1/movies?category=recent&pageSize=3').expect(200);
    expect(release.body.items.map((m: { year: number }) => m.year)).toEqual([2026, 2026, 2026]);
    const upcoming = await http().get('/api/v1/movies?category=upcoming').expect(200);
    expect(upcoming.body).toMatchObject({ items: [], total: 0 });
    await http().get('/api/v1/movies?pageSize=500').expect(400);
    await http().get('/api/v1/movies?category=nope').expect(400);
  });

  it('returns details with media + license for originals and none for metadata-only titles', async () => {
    const res = await http().get(`/api/v1/movies/${ids.projectionist}`).expect(200);
    const m = res.body.movie;
    expect(m).toMatchObject({
      id: ids.projectionist,
      playable: true,
      tagline: expect.any(String),
      cast: [],
      trailers: [],
      license: { type: 'DEMO_GENERATED', licensor: 'Jandi MovieHub' },
    });
    expect(m.media.map((a: { format: string }) => a.format)).toEqual(['WEBM', 'HLS']);
    expect(m.media[0]).toEqual({
      id: expect.any(String),
      label: expect.any(String),
      format: 'WEBM',
      durationSec: 120,
    });

    const bunny = (await http().get(`/api/v1/movies/${ids.bunny}`).expect(200)).body.movie;
    expect(bunny).toMatchObject({
      playable: false,
      media: [],
      license: null,
      voteAverage: null,
      cast: [],
    });
    expect(bunny.attribution).toMatch(/CC BY 3\.0/);

    await http().get('/api/v1/movies/00000000-0000-4000-8000-000000000000').expect(404);
    await http().get('/api/v1/movies/not-a-uuid').expect(400);
  });

  it('computes similar titles by shared genres and boosts recommendations by viewer taste', async () => {
    const similar = (await http().get(`/api/v1/movies/${ids.nosferatu}/similar`).expect(200)).body
      .items;
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.length).toBeLessThanOrEqual(12);
    expect(similar.map((m: { id: string }) => m.id)).not.toContain(ids.nosferatu);
    // Every result shares Horror or Fantasy with Nosferatu; both other horror titles are included.
    for (const m of similar)
      expect(m.genres.some((g: string) => g === 'Horror' || g === 'Fantasy')).toBe(true);
    expect(similar.map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining([ids.notld, ids.caligari]),
    );

    const anon = (await http().get(`/api/v1/movies/${ids.sunrise}/recommendations`).expect(200))
      .body.items;
    expect(anon.length).toBeGreaterThan(0);

    const u = await registerUser(t);
    await u.agent.put(`/api/v1/favorites/${ids.bunny}`).expect(204);
    await u.agent.put(`/api/v1/favorites/${ids.courier}`).expect(204);
    const personal = (
      await u.agent.get(`/api/v1/movies/${ids.sunrise}/recommendations`).expect(200)
    ).body.items;
    const animationIdx = personal.findIndex((m: { genres: string[] }) =>
      m.genres.includes('Animation'),
    );
    const firstNonAnimation = personal.findIndex(
      (m: { genres: string[] }) => !m.genres.includes('Animation') && !m.genres.includes('Drama'),
    );
    expect(animationIdx).toBeGreaterThanOrEqual(0);
    expect(animationIdx).toBeLessThan(firstNonAnimation === -1 ? Infinity : firstNonAnimation);
  });

  it('serves signed playback sources to registered users only', async () => {
    await http().get(`/api/v1/movies/${ids.neonDrift}/playback`).expect(401);
    const guest = await createGuest(t);
    await guest.agent.get(`/api/v1/movies/${ids.neonDrift}/playback`).expect(403);

    const u = await registerUser(t);
    const res = await u.agent.get(`/api/v1/movies/${ids.projectionist}/playback`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const [webm, hls] = res.body.sources;
    expect(webm).toMatchObject({
      format: 'WEBM',
      mimeType: 'video/webm',
      durationSec: 120,
      license: { type: 'DEMO_GENERATED' },
    });
    expect(webm.url).toMatch(
      new RegExp(`^/api/v1/media/${webm.assetId}/\\d+/[A-Za-z0-9_-]+/video\\.webm$`),
    );
    expect(webm.captions).toEqual([
      { lang: 'en', label: 'English', url: expect.stringMatching(/\/_captions\/en\.vtt$/) },
    ]);
    expect(hls).toMatchObject({ format: 'HLS', url: expect.stringMatching(/\/index\.m3u8$/) });

    const notPlayable = await u.agent.get(`/api/v1/movies/${ids.bunny}/playback`).expect(404);
    expect(notPlayable.body.error.code).toBe('NOT_PLAYABLE');
  });

  it('honours license verification and validity windows', async () => {
    const svc = t.app.get(CatalogService);
    expect(await svc.isPlayable(ids.neonDrift)).toBe(true);
    const asset = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: ids.neonWebm } });
    await t.prisma.contentLicense.update({
      where: { id: asset.licenseId },
      data: { validUntil: new Date(Date.now() - 1000) },
    });
    expect(await svc.isPlayable(ids.neonDrift)).toBe(false);
    expect(await svc.getPlaybackSourceForAsset(ids.neonWebm)).toBeNull();
    await t.prisma.contentLicense.update({
      where: { id: asset.licenseId },
      data: { validUntil: null, verifiedAt: null },
    });
    expect((await svc.getSummaries([ids.neonDrift]))[0]!.playable).toBe(false);
    await t.prisma.contentLicense.update({
      where: { id: asset.licenseId },
      data: { verifiedAt: new Date() },
    });
    await t.prisma.mediaAsset.update({ where: { id: ids.neonWebm }, data: { status: 'DISABLED' } });
    expect(await svc.isPlayable(ids.neonDrift)).toBe(false);
  });

  it('exposes reusable helpers: ordered summaries, runtimes and per-asset sources', async () => {
    const svc = t.app.get(CatalogService);
    const s = await svc.getSummaries([
      ids.sunrise,
      ids.bunny,
      ids.sunrise,
      '00000000-0000-4000-8000-000000000000',
    ]);
    expect(s.map((m) => m.id)).toEqual([ids.sunrise, ids.bunny, ids.sunrise]);
    expect(await svc.totalRuntimeSec([ids.sunrise, ids.courier, ids.sunrise])).toEqual({
      totalSec: 100,
      unknown: 0,
    });
    expect(await svc.totalRuntimeSec([ids.caligari, ids.bunny])).toEqual({
      totalSec: 600,
      unknown: 1,
    });
    const src = await svc.getPlaybackSourceForAsset(ids.projectionistHls);
    expect(src).toMatchObject({ assetId: ids.projectionistHls, format: 'HLS', durationSec: 120 });
    const sources = await svc.getPlaybackSources(ids.sunrise);
    expect(sources).toHaveLength(1);
  });

  it('serves deterministic generated artwork for local titles only', async () => {
    const res = await http().get('/api/v1/catalog/artwork/nosferatu-1922-poster.svg').expect(200);
    expect(res.headers['content-type']).toMatch(/^image\/svg\+xml/);
    const body = res.text || Buffer.from(res.body as Buffer).toString();
    expect(body).toContain('Generated artwork for');
    expect(body).not.toContain('DEMO ART');
    expect(body).toContain('Nosferatu');
    await http().get('/api/v1/catalog/artwork/neon-drift-backdrop.svg').expect(200);
    await http().get('/api/v1/catalog/artwork/unknown-title-poster.svg').expect(404);
    await http().get('/api/v1/catalog/artwork/..%2F..%2Fetc-poster.svg').expect(404);
  });

  it('re-seeding is idempotent and leaves assets PENDING when media files are missing', async () => {
    const before = await t.prisma.movie.count();
    const storageDir = t.app.get(AppConfig).storageDir;
    await seedCatalog(t.prisma, { storageDir, log: () => undefined });
    expect(await t.prisma.movie.count()).toBe(before);
    expect(await t.prisma.mediaAsset.count()).toBe(5);
    const logs: string[] = [];
    await seedCatalog(t.prisma, {
      storageDir: `${storageDir}/does-not-exist`,
      log: (m) => logs.push(m),
    });
    expect(await t.prisma.mediaAsset.count({ where: { status: 'PENDING' } })).toBe(5);
    expect(logs.join('\n')).toMatch(/pnpm media:generate/);
  });

  it('seeds demo users only with a valid password and never as admin', async () => {
    await expect(seedDemoUsers(t.prisma, 'short', () => undefined)).rejects.toThrow(
      /SEED_DEMO_PASSWORD/,
    );
    await seedDemoUsers(t.prisma, 'a-perfectly-fine-password', () => undefined);
    await seedDemoUsers(t.prisma, 'a-perfectly-fine-password', () => undefined);
    const users = await t.prisma.user.findMany({ where: { username: { startsWith: 'demo_' } } });
    expect(users.map((u) => [u.username, u.role])).toEqual(
      expect.arrayContaining([
        ['demo_alice', 'USER'],
        ['demo_bob', 'USER'],
      ]),
    );
    expect(await t.prisma.friendship.count()).toBe(1);
    await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'demo_alice@example.com', password: 'a-perfectly-fine-password' })
      .expect(200);
  });
});
