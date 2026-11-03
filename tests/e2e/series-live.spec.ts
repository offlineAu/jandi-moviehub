import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client';
import { expect, test } from '@playwright/test';
import { apiOk, createRoom, joinRoom, loginAs, registerUser, uniq } from './support/api';
import { player, waitForRoomReady } from './support/ui';
import { expectPlaying } from './support/video';

test('two people can watch a real series episode and navigate to the next', async ({ browser }) => {
  test.setTimeout(90_000);
  const envPath = resolve(process.cwd(), 'apps/api/.env');
  const env = parseEnv(readFileSync(envPath, 'utf8'));
  const base = new URL(process.env.DATABASE_URL ?? env.DATABASE_URL!);
  base.pathname = '/jandi_moviehub_e2e';
  if (base.pathname !== '/jandi_moviehub_e2e') throw new Error('Expected isolated E2E database');
  const db = new PrismaClient({ datasourceUrl: base.toString() });
  const movieIds: string[] = [];
  let seriesId = '';
  let roomId = '';
  const userIds: string[] = [];
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  try {
    const host = await registerUser('serieshost');
    userIds.push(host.id);
    const viewer = await registerUser('seriesview');
    userIds.push(viewer.id);
    await db.user.update({ where: { id: host.id }, data: { role: 'ADMIN' } });
    const source = await db.mediaAsset.findFirstOrThrow({
      where: { movie: { title: 'Neon Drift' }, status: 'APPROVED', format: 'WEBM' },
    });
    for (let n = 1; n <= 2; n++) {
      const movie = await db.movie.create({
        data: {
          title: `Series test episode ${n} ${uniq('e')}`,
          source: 'LOCAL',
          isDemo: true,
          mediaAssets: {
            create: {
              licenseId: source.licenseId,
              label: 'Test',
              format: source.format,
              storageDriver: source.storageDriver,
              storageKey: source.storageKey,
              mimeType: source.mimeType,
              durationSec: source.durationSec,
              status: 'APPROVED',
              approvedAt: new Date(),
            },
          },
        },
      });
      movieIds.push(movie.id);
    }
    const series = await apiOk<{ series: { id: string; title: string } }>(
      host,
      'POST',
      '/admin/series',
      { title: `Series test ${uniq('s')}` },
    );
    seriesId = series.series.id;
    for (let i = 0; i < 2; i++)
      await apiOk(host, 'POST', `/admin/series/${seriesId}/episodes`, {
        movieId: movieIds[i],
        seasonNumber: 1,
        episodeNumber: i + 1,
      });
    await loginAs(hostContext, host);
    await loginAs(viewerContext, viewer);
    const hostPage = await hostContext.newPage();
    const viewerPage = await viewerContext.newPage();
    await hostPage.goto(`/series/${seriesId}`);
    await expect(hostPage.getByRole('heading', { name: series.series.title })).toBeVisible();
    await hostPage.getByRole('button', { name: 'Create series playlist' }).click();
    await expect(hostPage).toHaveURL(/\/playlists\/[0-9a-f-]+$/);
    await expect(hostPage.getByText(/Series test episode 1/).first()).toBeVisible();
    await expect(hostPage.getByText(/Series test episode 2/).first()).toBeVisible();
    await hostPage.goto(`/series/${seriesId}`);
    const watchLinks = hostPage.getByRole('link', { name: 'Watch episode' });
    await expect(watchLinks).toHaveCount(2);
    await watchLinks.first().click();
    await expectPlaying(hostPage);
    // A stalled network fetch can occur while buffered video continues to play.
    await hostPage.locator('video').evaluate((video) => video.dispatchEvent(new Event('stalled')));
    await expect(hostPage.getByRole('status').filter({ hasText: 'Buffering' })).toHaveCount(0);
    // A real wait shows the indicator and the next playback event clears it.
    await hostPage.locator('video').evaluate((video) => video.pause());
    await expect(hostPage.locator('video')).toHaveJSProperty('paused', true);
    await hostPage.waitForTimeout(100); // Let the browser deliver the pause event first.
    await hostPage.locator('video').evaluate((video) => video.dispatchEvent(new Event('waiting')));
    await expect(hostPage.getByRole('status').filter({ hasText: 'Buffering' })).toBeVisible();
    await hostPage.locator('video').evaluate((video) => video.play());
    await expect(hostPage.getByRole('status').filter({ hasText: 'Buffering' })).toHaveCount(0);
    await player(hostPage).hover();
    await hostPage.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(hostPage).toHaveURL(new RegExp(`/watch/${movieIds[1]}$`));
    await expectPlaying(hostPage);
    const room = await createRoom(host, { name: `Series room ${uniq('r')}`, movieId: movieIds[1] });
    roomId = room.id;
    await joinRoom(viewer, roomId);
    await Promise.all([
      hostPage.goto(`/rooms/${room.code}`),
      viewerPage.goto(`/rooms/${room.code}`),
    ]);
    await Promise.all([waitForRoomReady(hostPage), waitForRoomReady(viewerPage)]);
    await hostPage.getByRole('button', { name: new RegExp(`^Play Series test episode 2`) }).click();
    await Promise.all([expectPlaying(hostPage), expectPlaying(viewerPage)]);
    await expect(player(viewerPage)).toHaveAccessibleName(/Series test episode 2/);
  } finally {
    await hostContext.close();
    await viewerContext.close();
    if (roomId) await db.room.deleteMany({ where: { id: roomId } });
    if (seriesId) await db.series.deleteMany({ where: { id: seriesId } });
    if (movieIds.length) await db.movie.deleteMany({ where: { id: { in: movieIds } } });
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
