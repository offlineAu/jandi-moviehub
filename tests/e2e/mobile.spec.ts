import { expect, test } from '@playwright/test';
import { createRoom, loginAs, movieByTitle, registerUser } from './support/api';
import { chatLog, horizontalOverflow, player, waitForRoomReady } from './support/ui';

/** Phone layout checks — run by the `mobile` project (Pixel 7) via the @mobile tag. */
test.describe('mobile layout @mobile', () => {
  test('home has no horizontal overflow @mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const o = await horizontalOverflow(page);
    expect(o.scrollWidth, JSON.stringify(o)).toBeLessThanOrEqual(o.innerWidth);
  });

  test('movie detail has no horizontal overflow @mobile', async ({ page }) => {
    const movie = await movieByTitle(/The Last Projectionist/);
    await page.goto(`/movies/${movie.id}`);
    await expect(page.getByRole('heading', { level: 1, name: movie.title })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const o = await horizontalOverflow(page);
    expect(o.scrollWidth, JSON.stringify(o)).toBeLessThanOrEqual(o.innerWidth);
  });

  test('room page: no horizontal overflow, chat reachable and usable @mobile', async ({
    page,
    context,
  }) => {
    const user = await registerUser('mob');
    await loginAs(context, user);
    const movie = await movieByTitle(/Neon Drift/);
    const room = await createRoom(user, { movieId: movie.id, visibility: 'PUBLIC' });
    await page.goto(`/rooms/${room.code}`);
    await waitForRoomReady(page);
    await expect(player(page)).toBeVisible();
    const o = await horizontalOverflow(page);
    expect(o.scrollWidth, JSON.stringify(o)).toBeLessThanOrEqual(o.innerWidth);

    // The side panel stacks under the player on phones; scroll to it and chat.
    const input = page.getByRole('textbox', { name: 'Message the room' });
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeInViewport();
    await expect(page.getByRole('tab', { name: /Chat/ })).toBeVisible();
    await input.fill('Hello from a phone');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(chatLog(page).getByText('Hello from a phone', { exact: true })).toBeVisible();
    const after = await horizontalOverflow(page);
    expect(after.scrollWidth).toBeLessThanOrEqual(after.innerWidth);
  });
});
