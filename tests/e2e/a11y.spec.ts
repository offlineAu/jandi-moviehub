import { expect, test, type Page } from '@playwright/test';
import { createRoom, loginAs, movieByTitle, registerUser, type TestUser } from './support/api';
import { axeScan, waitForRoomReady } from './support/ui';

/** axe-core WCAG 2 A/AA scans. Serious/critical violations fail; moderate ones are reported. */

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

test.describe('axe — signed out', () => {
  const pages: Array<[string, string | (() => Promise<string>), string]> = [
    ['home', '/', 'h1'],
    ['browse', '/browse', 'h1'],
    ['movie-detail', async () => `/movies/${(await movieByTitle(/Neon Drift/)).id}`, 'h1'],
    ['login', '/login', 'h1'],
    ['register', '/register', 'h1'],
    ['rooms', '/rooms', 'h1'],
  ];
  for (const [label, path] of pages) {
    test(`axe: ${label}`, async ({ page }, testInfo) => {
      await page.goto(typeof path === 'string' ? path : await path());
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await settle(page);
      const r = await axeScan(page, testInfo, label);
      expect(r.blocking, JSON.stringify(r.blocking, null, 2)).toEqual([]);
    });
  }
});

test.describe('axe — signed in', () => {
  let user: TestUser;
  test.beforeAll(async () => {
    user = await registerUser('axe');
  });
  test.beforeEach(async ({ context }) => {
    await loginAs(context, user);
  });

  for (const [label, path] of [
    ['home-signed-in', '/'],
    ['library', '/library'],
    ['playlists', '/playlists'],
    ['friends', '/friends'],
    ['notifications', '/notifications'],
  ] as const) {
    test(`axe: ${label}`, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await settle(page);
      const r = await axeScan(page, testInfo, label);
      expect(r.blocking, JSON.stringify(r.blocking, null, 2)).toEqual([]);
    });
  }

  test('axe: room page (player + chat)', async ({ page }, testInfo) => {
    const movie = await movieByTitle(/Neon Drift/);
    const room = await createRoom(user, { movieId: movie.id, visibility: 'PUBLIC' });
    await page.goto(`/rooms/${room.code}`);
    await waitForRoomReady(page);
    await expect(page.getByRole('region', { name: 'Video player: Neon Drift' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.readyState ?? 0))
      .toBeGreaterThanOrEqual(1);
    const r = await axeScan(page, testInfo, 'room');
    expect(r.blocking, JSON.stringify(r.blocking, null, 2)).toEqual([]);
  });
});
