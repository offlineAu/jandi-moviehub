import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, loginAs, movieByTitle, registerUser } from './support/api';
import { chatLog, horizontalOverflow, player, waitForRoomReady } from './support/ui';

/** Phone layout checks — run by the `mobile` project (Pixel 7) via the @mobile tag. */

/** Seeded Jandi Original (apps/api/prisma/seed.ts `seedUuid`), playable from local demo media. */
const NEON_DRIFT_ID = 'ce618164-df81-5a81-b222-94fbde714603';
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

  test('create-room form stays within the screen after picking a movie @mobile', async ({
    page,
    context,
  }) => {
    const user = await registerUser('mobform');
    await loginAs(context, user);
    // A common small-Android width; the overflow below doesn't show on the 412px Pixel 7.
    const screenWidth = 360;
    await page.setViewportSize({ width: screenWidth, height: 780 });
    // The selected-movie row (poster, title, Change/Remove) used to force every grid section
    // wider than the card. Preselect the seeded Neon Drift by its stable seed id
    // (apps/api/prisma/seed.ts `seedUuid`) so this doesn't depend on catalog search.
    await page.goto('/rooms/new?movieId=ce618164-df81-5a81-b222-94fbde714603');
    await expect(page.getByRole('heading', { name: 'Start a watch party' })).toBeVisible();
    await expect(page.getByText('Neon Drift')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove movie' })).toBeVisible();
    // Compare against the real screen width: on overflow a mobile browser zooms the page out,
    // which grows innerWidth to match and would hide the bug.
    const o = await horizontalOverflow(page);
    expect(o, JSON.stringify(o)).toEqual({ scrollWidth: screenWidth, innerWidth: screenWidth });
    for (const name of ['Change', 'Remove movie', 'Open the room']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.x + box.width, name).toBeLessThanOrEqual(screenWidth);
    }
    // Phone keyboards zoom into fields under 16px (iOS) and never zoom back out.
    const fontSize = await page
      .getByLabel('Room name')
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe('16px');
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

  for (const orientation of ['portrait', 'landscape'] as const) {
    test(`full-screen watch party: read and reply to chat (${orientation}) @mobile`, async ({
      page,
      context,
      browser,
    }) => {
      if (orientation === 'landscape') await page.setViewportSize({ width: 915, height: 412 });
      const host = await registerUser('fshost');
      const viewer = await registerUser('fsview');
      const room = await createRoom(host, { movieId: NEON_DRIFT_ID, visibility: 'PUBLIC' });
      await joinRoom(viewer, room.id);
      await loginAs(context, viewer);

      const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await loginAs(hostContext, host);
      const hostPage = await hostContext.newPage();
      await hostPage.goto(`/rooms/${room.code}`);
      await waitForRoomReady(hostPage);

      await page.goto(`/rooms/${room.code}`);
      await waitForRoomReady(page);
      await expect(player(page)).toBeVisible();
      await player(page).tap({ position: { x: 30, y: 30 } });
      await page.getByRole('button', { name: 'Full screen' }).tap();
      await expect(player(page)).toHaveAttribute('data-fullscreen', 'true');

      // Reading: a new message floats over the picture and the toggle counts it.
      await hostPage.getByRole('textbox', { name: 'Message the room' }).fill('Grab the popcorn');
      await hostPage.getByRole('button', { name: 'Send message' }).click();
      await expect(player(page).getByRole('button', { name: /Grab the popcorn/ })).toBeVisible();
      await player(page).getByRole('button', { name: 'Show chat, 1 unread message' }).tap();

      // Replying from the chat panel inside the full-screen player.
      const panel = player(page).getByRole('region', { name: 'Room chat' });
      await expect(panel.getByText('Grab the popcorn', { exact: true })).toBeVisible();
      await panel.getByRole('textbox', { name: 'Message the room' }).fill('On my way');
      await panel.getByRole('button', { name: 'Send message' }).tap();
      await expect(chatLog(hostPage).getByText('On my way', { exact: true })).toBeVisible();

      // The panel sits beside the picture: the player's controls stay uncovered.
      const panelBox = (await panel.boundingBox())!;
      const exitBox = (await page.getByRole('button', { name: 'Exit full screen' }).boundingBox())!;
      if (orientation === 'portrait')
        expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(panelBox.y);
      else expect(exitBox.x + exitBox.width).toBeLessThanOrEqual(panelBox.x);

      await panel.getByRole('button', { name: 'Hide chat' }).tap();
      await expect(panel).toBeHidden();
      await hostContext.close();
    });
  }
});
