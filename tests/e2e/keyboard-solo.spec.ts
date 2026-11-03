import { expect, test } from '@playwright/test';
import { loginAs, movieByTitle, registerUser } from './support/api';
import { player } from './support/ui';
import { expectPaused, expectPlaying, videoSample } from './support/video';

test('skip link moves focus to the main content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator('main#main')).toBeFocused();
});

test('keyboard: tab to the solo player and toggle play/pause with Space', async ({
  page,
  context,
}) => {
  const user = await registerUser('kbd');
  await loginAs(context, user);
  const movie = await movieByTitle(/Paper Moon Courier/);
  await page.goto(`/watch/${movie.id}`);
  await expect(player(page)).toHaveAccessibleName('Video player: Paper Moon Courier');
  await expectPlaying(page); // solo autoplay

  // Tab from the top of the document until the player region has focus.
  await page.locator('body').focus();
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label')?.startsWith('Video player:') ?? false,
    );
  }
  expect(reached, 'player should be reachable with Tab').toBe(true);
  await expect(player(page)).toBeFocused();

  await page.keyboard.press('Space');
  await expectPaused(page);
  const pausedAt = (await videoSample(page))!.ct;
  await page.waitForTimeout(500);
  expect((await videoSample(page))!.ct).toBeCloseTo(pausedAt, 2);
  await page.keyboard.press('Space');
  await expectPlaying(page);
});

test('solo watch saves progress and shows it in “Continue watching”', async ({ page, context }) => {
  const user = await registerUser('solo');
  await loginAs(context, user);
  const movie = await movieByTitle(/Neon Drift/);
  await page.goto(`/watch/${movie.id}`);
  await expectPlaying(page);

  await player(page).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('l'); // +40 s
  await expect.poll(async () => (await videoSample(page))!.ct).toBeGreaterThan(38);
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/v1/history/progress') && r.request().method() === 'PUT',
  );
  await page.keyboard.press('Space'); // pause → progress saved
  await expectPaused(page);
  expect((await saved).status()).toBe(204);
  const position = (await videoSample(page))!.ct;

  await page.goto('/');
  const rail = page.getByRole('region', { name: 'Continue watching' });
  await expect(rail.getByRole('link', { name: /^Neon Drift/ })).toBeVisible();

  await page.goto('/library');
  await expect(page.getByRole('tab', { name: 'Continue watching', selected: true })).toBeVisible();
  const entry = page.getByRole('link', { name: /Neon Drift/ });
  await expect(entry).toContainText(/0:4\d watched/);

  // Resume offers the saved spot, and the player starts there.
  await page.goto(`/movies/${movie.id}`);
  await expect(page.getByRole('link', { name: /^Resume from 0:4\d$/ })).toBeVisible();
  await page.getByRole('link', { name: /^Resume from/ }).click();
  await expect.poll(async () => (await videoSample(page))?.ct ?? 0).toBeGreaterThan(position - 2);
});
