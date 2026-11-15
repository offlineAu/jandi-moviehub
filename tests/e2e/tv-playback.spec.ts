import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { expect, test } from '@playwright/test';
import { loginAs, registerUser } from './support/api';
import { expectPlaying } from './support/video';

for (const signedIn of [false, true])
  test(`an approved linked TV episode plays ${signedIn ? 'with an account' : 'without login'}`, async ({
    page,
    context,
  }) => {
    const env = parseEnv(readFileSync(resolve(process.cwd(), 'apps/api/.env'), 'utf8'));
    const dbUrl = new URL(process.env.DATABASE_URL ?? env.DATABASE_URL!);
    dbUrl.pathname = '/jandi_moviehub_e2e';
    const db = new PrismaClient({ datasourceUrl: dbUrl.toString() });
    const tmdbId = 1999999991;
    let userId = '';
    try {
      if (signedIn) {
        const user = await registerUser('tvplay');
        userId = user.id;
        await loginAs(context, user);
      }
      const movie = await db.movie.findFirstOrThrow({
        where: { title: 'Neon Drift', mediaAssets: { some: { status: 'APPROVED' } } },
      });
      await db.tvEpisodeMedia.create({
        data: { tmdbId, season: 1, episode: 1, movieId: movie.id },
      });
      await page.route(`**/api/v1/tv/${tmdbId}`, (route) =>
        route.fulfill({
          json: {
            series: {
              title: 'Demo episode',
              seasons: [{ season_number: 1, name: 'Season 1', episode_count: 1 }],
            },
          },
        }),
      );
      await page.route(`**/api/v1/tv/${tmdbId}/seasons/1`, (route) =>
        route.fulfill({
          json: {
            season: {
              name: 'Season 1',
              overview: '',
              episodes: [
                { id: 1, number: 1, title: 'Demo', overview: '', airDate: null, runtimeMin: null },
              ],
            },
          },
        }),
      );
      await page.route(`**/api/v1/tv/${tmdbId}/seasons/1/episodes/1`, (route) =>
        route.fulfill({
          json: {
            episode: {
              number: 1,
              seasonNumber: 1,
              title: 'Demo',
              overview: '',
              airDate: null,
              runtimeMin: null,
              stillUrl: null,
            },
            previous: null,
            next: null,
          },
        }),
      );
      await page.goto(`/watch/tv/${tmdbId}/season/1/episode/1`);
      await expectPlaying(page);
      await expect(
        page.getByText('Full-episode playback is not currently available in Jandi MovieHub.'),
      ).toHaveCount(0);
    } finally {
      await db.tvEpisodeMedia.deleteMany({ where: { tmdbId } });
      if (userId) await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    }
  });
