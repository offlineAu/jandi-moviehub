import { expect, test } from '@playwright/test';
import {
  apiOk,
  createRoom,
  loginAs,
  movieByTitle,
  playbackState,
  registerUser,
  uniq,
} from './support/api';
import { chatLog, expectHostOnlyFeedback, player, sendChat, waitForRoomReady } from './support/ui';

test.describe('guest flow', () => {
  test('guest joins a guest-enabled public room, sees chat, cannot control', async ({ page }) => {
    const host = await registerUser('ghost');
    const movie = await movieByTitle(/Neon Drift/);
    const room = await createRoom(host, {
      name: `Guests welcome ${uniq('g').slice(-6)}`,
      visibility: 'PUBLIC',
      allowGuests: true,
      movieId: movie.id,
    });
    const hostLine = `Welcome guests ${uniq('m')}`;
    await apiOk(host, 'POST', `/rooms/${room.id}/messages`, { body: hostLine });
    const before = await playbackState(host, room.id);

    await page.goto(`/rooms/${room.code}`);
    await expect(page.getByRole('heading', { level: 1, name: room.name })).toBeVisible();
    await page.getByLabel('Your name in the room').fill('Popcorn Guest');
    await page.getByRole('button', { name: 'Continue as guest' }).click();

    await waitForRoomReady(page);
    await expect(player(page)).toHaveAccessibleName('Video player: Neon Drift');
    await expect(chatLog(page).getByText(hostLine, { exact: true })).toBeVisible();
    const guestLine = `Hi from a guest ${uniq('m')}`;
    await sendChat(page, guestLine);
    const { items } = await apiOk<{
      items: Array<{ body: string; author: { isGuest: boolean } | null }>;
    }>(host, 'GET', `/rooms/${room.id}/messages`);
    expect(items.find((m) => m.body === guestLine)?.author?.isGuest).toBe(true);

    // No control: disabled transport, local refusal, and the server state never moves.
    await expect(
      page.getByText('Only hosts can play, pause or seek. Volume and captions are yours.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play Neon Drift' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await player(page).focus();
    await page.keyboard.press('k');
    await expectHostOnlyFeedback(page);
    const rest = await page.evaluate(async (id) => {
      const r = await fetch(`/api/v1/rooms/${id}/marathon/start`, { method: 'POST' });
      return r.status;
    }, room.id);
    expect(rest).toBe(403);
    const after = await playbackState(host, room.id);
    expect(after.state.version).toBe(before.state.version);
    expect(after.state.status).toBe('paused');
  });
});

test.describe('room access control', () => {
  test('stranger gets “not found or private” for a private room code', async ({
    page,
    context,
  }) => {
    const host = await registerUser('phost');
    const stranger = await registerUser('strg');
    const room = await createRoom(host, {
      visibility: 'PRIVATE',
      name: `Secret ${uniq('s').slice(-6)}`,
    });
    await loginAs(context, stranger);
    await page.goto(`/rooms/${room.code}`);
    await expect(page.getByRole('heading', { name: 'Room not found or private' })).toBeVisible();
    await expect(page.getByText(room.name)).toHaveCount(0);
    // Not listed in public discovery either.
    const list = await apiOk<{ items: Array<{ code: string }> }>(
      stranger,
      'GET',
      `/rooms?q=${encodeURIComponent(room.name)}`,
    );
    expect(list.items.map((r) => r.code)).not.toContain(room.code);
  });

  test('wrong room password shows an error; the right one lets you in', async ({
    page,
    context,
  }) => {
    const host = await registerUser('pwhost');
    const visitor = await registerUser('pwvis');
    const room = await createRoom(host, {
      visibility: 'PASSWORD',
      password: 'open-sesame',
      name: `Locked ${uniq('l').slice(-6)}`,
    });
    await loginAs(context, visitor);
    await page.goto(`/rooms/${room.code}`);
    await expect(page.getByText('Password required')).toBeVisible();
    const pw = page.getByLabel('Room password');
    await pw.fill('wrong-password');
    await page.getByRole('button', { name: 'Join the watch party' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'That password isn’t right.' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: /^Video player/ })).toHaveCount(0);

    await pw.fill('open-sesame');
    await page.getByRole('button', { name: 'Join the watch party' }).click();
    await waitForRoomReady(page);
    await expect(page.getByRole('heading', { level: 1, name: room.name })).toBeVisible();
  });
});
