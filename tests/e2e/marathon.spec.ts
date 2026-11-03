import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  apiOk,
  createInvite,
  joinRoom,
  loginAs,
  registerUser,
  uniq,
  type TestUser,
} from './support/api';
import { rawSocket } from './support/socket';
import { player, waitForRoomReady } from './support/ui';
import { expectPlaying } from './support/video';

type Marathon = {
  state: string;
  currentIndex: number;
  items: Array<{ id: string; title: string }>;
};

/** Scenarios 13–16 (+ marathon variant of 19/20). */
test.describe.serial('marathon playlist', () => {
  test.setTimeout(120_000);

  let host: TestUser;
  let viewer: TestUser;
  let hostCtx: BrowserContext;
  let viewerCtx: BrowserContext;
  let hostPage: Page;
  let viewerPage: Page;
  let playlistUrl = '';
  let roomCode = '';
  let roomId = '';
  const playlistName = `Short double bill ${uniq('p').slice(-6)}`;

  test.beforeAll(async ({ browser }) => {
    host = await registerUser('mhost');
    viewer = await registerUser('mview');
    hostCtx = await browser.newContext();
    viewerCtx = await browser.newContext();
    await loginAs(hostCtx, host);
    await loginAs(viewerCtx, viewer);
    hostPage = await hostCtx.newPage();
    viewerPage = await viewerCtx.newPage();
  });

  test.afterAll(async () => {
    await hostCtx?.close();
    await viewerCtx?.close();
  });

  const marathonOf = async () =>
    (await apiOk<{ marathon: Marathon | null }>(host, 'GET', `/rooms/${roomId}/marathon`)).marathon;

  test('13 create a marathon playlist via UI', async () => {
    await hostPage.goto('/playlists');
    await expect(hostPage.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible();
    await hostPage.getByRole('button', { name: 'New playlist' }).click();
    const dialog = hostPage.getByRole('dialog', { name: 'New playlist' });
    await dialog.getByLabel('Name').fill(playlistName);
    await dialog.getByRole('button', { name: 'Create playlist' }).click();
    await expect(hostPage).toHaveURL(/\/playlists\/[0-9a-f-]{36}$/);
    playlistUrl = hostPage.url();
    await expect(hostPage.getByRole('heading', { level: 1, name: playlistName })).toBeVisible();
    await expect(hostPage.getByText('No movies yet')).toBeVisible();
  });

  test('14 add multiple playable movies', async () => {
    // Header action (the empty lineup offers a second "Add movies" button).
    await hostPage.getByRole('button', { name: 'Add movies' }).first().click();
    const dialog = hostPage.getByRole('dialog', { name: 'Add movies' });
    await dialog.getByRole('checkbox', { name: 'Only show titles available to stream' }).check();
    const search = dialog
      .getByRole('searchbox', { name: 'Search movies to add' })
      .or(dialog.getByRole('textbox', { name: 'Search movies to add' }));
    // Order matters: the 20 s title first so the transition happens quickly.
    for (const title of ['Twenty Second Sunrise', 'Paper Moon Courier']) {
      await search.fill(title.split(' ').slice(0, 2).join(' '));
      await dialog.getByRole('button', { name: `Add ${title}` }).click();
      await expect(
        dialog.getByRole('button', { name: `Add another copy of ${title}` }),
      ).toBeVisible();
    }
    await hostPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const lineup = hostPage
      .getByRole('region', { name: /lineup/i })
      .or(hostPage.locator('section[aria-labelledby="playlist-lineup"]'));
    await expect(lineup.getByText('Twenty Second Sunrise')).toBeVisible();
    await expect(lineup.getByText('Paper Moon Courier')).toBeVisible();

    const id = playlistUrl.split('/').pop()!;
    const { playlist } = await apiOk<{
      playlist: {
        items: Array<{ movie: { title: string; playable: boolean } }>;
        playableCount: number;
      };
    }>(host, 'GET', `/playlists/${id}`);
    expect(playlist.items.map((i) => i.movie.title)).toEqual([
      'Twenty Second Sunrise',
      'Paper Moon Courier',
    ]);
    expect(playlist.playableCount).toBe(2);
  });

  test('15 start marathon mode', async () => {
    await hostPage.getByRole('link', { name: 'Watch as a marathon' }).click();
    await expect(hostPage).toHaveURL(/\/rooms\/new\?playlistId=/);
    await hostPage.getByLabel('Room name').fill(`Marathon ${uniq('m').slice(-6)}`);
    await expect(hostPage.getByText('2 of 2 titles playable')).toBeVisible();
    await hostPage.getByLabel('Countdown (seconds)').fill('2');
    await hostPage.getByLabel('Intermission (seconds)').fill('3');
    await hostPage.getByRole('radio', { name: /^Private/ }).click();
    await hostPage.getByRole('button', { name: 'Create room and marathon' }).click();
    await expect(hostPage).toHaveURL(/\/rooms\/[A-Z0-9]{8}$/);
    roomCode = hostPage.url().split('/').pop()!;
    await waitForRoomReady(hostPage);
    await expect(hostPage.getByText('Marathon: Ready')).toBeVisible();

    const { room } = await apiOk<{ room: { id: string } }>(host, 'GET', `/rooms/code/${roomCode}`);
    roomId = room.id;
    const token = await createInvite(host, roomId);
    await joinRoom(viewer, roomId, token);
    await viewerPage.goto(`/rooms/${roomCode}`);
    await waitForRoomReady(viewerPage);
    await expect(viewerPage.getByText('The marathon is ready')).toBeVisible();

    await hostPage.getByRole('tab', { name: /Marathon/ }).click();
    await hostPage.getByRole('button', { name: 'Start marathon' }).click();
    // Countdown (2 s) → the first title plays for everyone.
    await expect(player(hostPage)).toHaveAccessibleName('Video player: Twenty Second Sunrise', {
      timeout: 15_000,
    });
    await expect(player(viewerPage)).toHaveAccessibleName('Video player: Twenty Second Sunrise', {
      timeout: 15_000,
    });
    await expectPlaying(hostPage);
    await expectPlaying(viewerPage);
    const m = await marathonOf();
    expect(m?.state).toBe('PLAYING');
    expect(m?.currentIndex).toBe(0);
  });

  test('19+20 (marathon) viewer cannot skip; server rejects with 403', async () => {
    await viewerPage.getByRole('tab', { name: /Marathon/ }).click();
    await expect(viewerPage.getByRole('list', { name: 'Marathon lineup' })).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Skip' })).toHaveCount(0);
    const before = await marathonOf();

    const res = await viewerPage.evaluate(async (id) => {
      const out: Record<string, { status: number; code?: string }> = {};
      for (const cmd of ['skip', 'stop', 'previous']) {
        const r = await fetch(`/api/v1/rooms/${id}/marathon/${cmd}`, { method: 'POST' });
        out[cmd] = {
          status: r.status,
          code: ((await r.json()) as { error?: { code: string } }).error?.code,
        };
      }
      return out;
    }, roomId);
    for (const cmd of ['skip', 'stop', 'previous']) {
      expect(res[cmd]!.status, `${cmd} must be forbidden`).toBe(403);
      expect(res[cmd]!.code).toBe('FORBIDDEN');
    }

    // Raw socket: changing the movie mid-marathon as a viewer.
    const sock = await rawSocket(viewer.cookies);
    try {
      expect((await sock.emit('room:join', { roomId })).ok).toBe(true);
      const ack = await sock.emit('playback:pause', {
        roomId,
        commandId: crypto.randomUUID(),
        baseVersion: 0,
      });
      expect(ack.ok).toBe(false);
      if (!ack.ok) expect(ack.error.code).toBe('FORBIDDEN');
    } finally {
      sock.close();
    }

    const after = await marathonOf();
    expect(after?.currentIndex).toBe(before?.currentIndex);
    expect(after?.state).toBe(before?.state);
    await expectPlaying(hostPage);
  });

  test('16 marathon transitions to the second movie in both browsers', async () => {
    // Intermission (3 s) is announced over the player, then the next title loads for everyone.
    await expect(
      viewerPage.getByRole('status').filter({ hasText: 'Up next: Paper Moon Courier' }),
    ).toBeVisible({
      timeout: 40_000,
    });
    for (const page of [hostPage, viewerPage]) {
      await expect(player(page)).toHaveAccessibleName('Video player: Paper Moon Courier', {
        timeout: 20_000,
      });
      await expect(page.getByText('Now showing Paper Moon Courier')).toBeVisible();
    }
    await expectPlaying(hostPage);
    await expectPlaying(viewerPage);
    await expect(
      viewerPage.getByRole('list', { name: 'Marathon lineup' }).locator('li[aria-current="true"]'),
    ).toContainText('Paper Moon Courier');
    const m = await marathonOf();
    expect(m?.state).toBe('PLAYING');
    expect(m?.currentIndex).toBe(1);
  });
});
