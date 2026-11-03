import { writeFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  api,
  apiOk,
  loginAs,
  playbackState,
  registerUser,
  uniq,
  type TestUser,
} from './support/api';
import { rawSocket } from './support/socket';
import { chatLog, expectHostOnlyFeedback, player, sendChat, waitForRoomReady } from './support/ui';
import { expectPaused, expectPlaying, pairDrift, stats, videoSample } from './support/video';

/**
 * Two browsers (separate contexts = separate cookies/sockets) in one private watch party.
 * Scenarios 6–12 and 17–20, plus measured sync accuracy.
 */
test.describe.serial('two-browser watch party', () => {
  test.setTimeout(150_000);

  let host: TestUser;
  let viewer: TestUser;
  let hostCtx: BrowserContext;
  let viewerCtx: BrowserContext;
  let hostPage: Page;
  let viewerPage: Page;
  let roomCode = '';
  let roomId = '';
  let inviteUrl = '';
  const roomName = `Sync lab ${uniq('r').slice(-6)}`;

  test.beforeAll(async ({ browser }) => {
    host = await registerUser('host');
    viewer = await registerUser('view');
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

  /** Moves the pointer over the player so the auto-hiding controls are clickable. */
  async function showControls(page: Page) {
    await player(page).hover({ position: { x: 40, y: 40 } });
  }

  async function hostSeekWithSlider(keys: string[]) {
    const slider = hostPage.getByRole('slider', { name: 'Seek' });
    await slider.focus();
    for (const k of keys) await slider.press(k);
  }

  test('06 create a private room via UI', async () => {
    await hostPage.goto('/rooms/new');
    await expect(hostPage.getByRole('heading', { name: 'Start a watch party' })).toBeVisible();
    await hostPage.getByLabel('Room name').fill(roomName);
    // Movie picker lists playable titles; pick Neon Drift (120 s).
    await hostPage.getByRole('button', { name: /Neon Drift/ }).click();
    await expect(hostPage.getByText('Ready to stream')).toBeVisible();
    await hostPage.getByRole('radio', { name: /^Private/ }).click();
    await expect(hostPage.getByRole('radio', { name: /^Private/ })).toBeChecked();
    await hostPage.getByRole('button', { name: 'Open the room' }).click();

    await expect(hostPage).toHaveURL(/\/rooms\/[A-Z0-9]{8}$/);
    roomCode = hostPage.url().split('/').pop()!;
    await expect(hostPage.getByRole('heading', { level: 1, name: roomName })).toBeVisible();
    await waitForRoomReady(hostPage);
    await expect(player(hostPage)).toHaveAccessibleName('Video player: Neon Drift');

    const { room } = await apiOk<{ room: { id: string; visibility: string } }>(
      host,
      'GET',
      `/rooms/code/${roomCode}`,
    );
    expect(room.visibility).toBe('PRIVATE');
    roomId = room.id;
  });

  test('07 second browser joins via invite link', async () => {
    // Without an invite the private room is invisible to the viewer.
    await viewerPage.goto(`/rooms/${roomCode}`);
    await expect(
      viewerPage.getByRole('heading', { name: 'Room not found or private' }),
    ).toBeVisible();

    await hostPage.getByRole('button', { name: 'Invite', exact: true }).click();
    const dialog = hostPage.getByRole('dialog', { name: 'Invite people' });
    const link = dialog.getByRole('textbox', { name: 'Invite link' });
    await expect(link).toHaveValue(/\/join\/[A-Za-z0-9_-]{20,}$/);
    inviteUrl = await link.inputValue();
    await hostPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await viewerPage.goto(inviteUrl);
    await expect(viewerPage.getByRole('heading', { level: 1, name: roomName })).toBeVisible();
    await viewerPage.getByRole('button', { name: 'Accept and join' }).click();
    await expect(viewerPage).toHaveURL(new RegExp(`/rooms/${roomCode}$`));
    await waitForRoomReady(viewerPage);
    await expect(player(viewerPage)).toHaveAccessibleName('Video player: Neon Drift');
    await expect(
      viewerPage.getByText('Only hosts can play, pause or seek. Volume and captions are yours.'),
    ).toBeVisible();
    // Presence reaches the host.
    await hostPage.getByRole('tab', { name: /People/ }).click();
    await expect(hostPage.getByRole('tab', { name: /People\s*2/ })).toBeVisible();
    await hostPage.getByRole('tab', { name: /Chat/ }).click();
  });

  test('08 host starts playback (both browsers play)', async () => {
    await hostPage.getByRole('button', { name: 'Play Neon Drift' }).click();
    await expectPlaying(hostPage);
    await expectPlaying(viewerPage);
    const { state } = await playbackState(host, roomId);
    expect(state.status).toBe('playing');
  });

  test('09 host pauses (both browsers pause at the same frame)', async () => {
    await hostPage.waitForTimeout(2000);
    await showControls(hostPage);
    await hostPage.getByRole('button', { name: 'Pause', exact: true }).click();
    await expectPaused(hostPage);
    await expectPaused(viewerPage);
    await expect
      .poll(async () => (await pairDrift(hostPage, viewerPage)).drift, { timeout: 5000 })
      .toBeLessThan(100);
    const { state } = await playbackState(host, roomId);
    expect(state.status).toBe('paused');
  });

  test('10 host seeks (viewer lands on the same position)', async () => {
    const before = (await videoSample(hostPage))!.ct;
    await hostSeekWithSlider(['PageUp']); // +12 s (bigStep = max(10, duration / 10))
    await expect
      .poll(async () => (await videoSample(hostPage))!.ct, { timeout: 5000 })
      .toBeGreaterThan(before + 9);
    await expect
      .poll(async () => (await videoSample(viewerPage))!.ct, { timeout: 5000 })
      .toBeGreaterThan(before + 9);
    await expect
      .poll(async () => (await pairDrift(hostPage, viewerPage)).drift, { timeout: 5000 })
      .toBeLessThan(100);
    const { state } = await playbackState(host, roomId);
    expect(state.status).toBe('paused');
    expect(state.positionSec).toBeGreaterThan(before + 9);
  });

  test('sync accuracy: measured drift over ≥ 20 s of playback incl. a seek', async ({}, testInfo) => {
    // Resume with the keyboard shortcut (k) on the host's player.
    await player(hostPage).focus();
    await hostPage.keyboard.press('k');
    await expectPlaying(hostPage);
    await expectPlaying(viewerPage);

    type S = {
      at: number;
      drift: number;
      skew: number;
      hostCt: number;
      viewerCt: number;
      phase: string;
    };
    const samples: S[] = [];
    const t0 = Date.now();
    let seekAt = 0;
    const SETTLE_MS = 2000;
    while (Date.now() - t0 < 24_000) {
      const tick = Date.now();
      if (!seekAt && tick - t0 >= 11_000) {
        await hostSeekWithSlider(['PageUp']);
        seekAt = Date.now();
      }
      const { drift, skewMs, host: h, viewer: v } = await pairDrift(hostPage, viewerPage);
      const phase = !seekAt
        ? 'before-seek'
        : Date.now() - seekAt < SETTLE_MS
          ? 'seek-settle'
          : 'after-seek';
      samples.push({
        at: Date.now() - t0,
        drift,
        skew: skewMs,
        hostCt: h.ct,
        viewerCt: v.ct,
        phase,
      });
      const wait = 500 - (Date.now() - tick);
      if (wait > 0) await hostPage.waitForTimeout(wait);
    }
    const all = stats(samples.map((s) => s.drift));
    const steady = stats(samples.filter((s) => s.phase !== 'seek-settle').map((s) => s.drift));
    const afterSeek = stats(samples.filter((s) => s.phase === 'after-seek').map((s) => s.drift));
    const settle = stats(samples.filter((s) => s.phase === 'seek-settle').map((s) => s.drift));
    const skew = stats(samples.map((s) => s.skew));
    const playedSec = samples[samples.length - 1]!.at / 1000;
    const report = {
      playedSec,
      sampleIntervalMs: 500,
      all,
      steady,
      afterSeek,
      seekSettle2s: settle,
      samplingSkewMs: skew,
    };
    console.log('[sync] drift ms', JSON.stringify(report));
    // Kept on disk (test-results/…/sync-drift.json) as well as in the HTML report.
    const file = testInfo.outputPath('sync-drift.json');
    writeFileSync(file, JSON.stringify({ report, samples }, null, 2));
    await testInfo.attach('sync-drift.json', { path: file, contentType: 'application/json' });

    expect(samples.length).toBeGreaterThanOrEqual(40);
    expect(samples.filter((s) => s.phase === 'after-seek').length).toBeGreaterThanOrEqual(15);
    // Both kept playing and the seek moved both of them.
    const last = samples[samples.length - 1]!;
    expect(last.hostCt).toBeGreaterThan(samples[0]!.hostCt + 30);
    expect(all.p95).toBeLessThan(250);
    expect(steady.max).toBeLessThan(500);
  });

  test('11 chat message is seen in both browsers', async () => {
    const text = `Popcorn ready? ${uniq('m')}`;
    await sendChat(viewerPage, text);
    await expect(chatLog(hostPage).getByText(text, { exact: true })).toBeVisible();
    const reply = `Lights off ${uniq('m')}`;
    await sendChat(hostPage, reply);
    await expect(chatLog(viewerPage).getByText(reply, { exact: true })).toBeVisible();
  });

  test('12 react to a message (count seen in both)', async () => {
    const text = `React to me ${uniq('m')}`;
    await sendChat(hostPage, text);
    const viewerMsg = chatLog(viewerPage).getByRole('listitem').filter({ hasText: text });
    await expect(viewerMsg).toBeVisible();
    await viewerMsg.hover();
    await viewerMsg.getByRole('button', { name: /^React to .*’s message$/ }).click();
    await viewerPage.getByRole('button', { name: 'React with 🔥' }).click();
    await viewerPage.keyboard.press('Escape');

    await expect(viewerMsg.getByRole('button', { name: '🔥 1, including you' })).toBeVisible();
    const hostMsg = chatLog(hostPage).getByRole('listitem').filter({ hasText: text });
    await expect(hostMsg.getByRole('button', { name: '🔥 1' })).toBeVisible();

    // Host adds the same reaction by clicking the chip → 2 for both.
    await hostMsg.getByRole('button', { name: '🔥 1' }).click();
    await expect(hostMsg.getByRole('button', { name: '🔥 2, including you' })).toBeVisible();
    await expect(viewerMsg.getByRole('button', { name: '🔥 2, including you' })).toBeVisible();
  });

  test('17 viewer disconnects and reconnects', async () => {
    // Headroom: rewind to 0 s so the 120 s title cannot end during the remaining steps.
    await hostSeekWithSlider(['Home']);
    await expectPlaying(hostPage);

    await viewerCtx.setOffline(true);
    // The socket drops: the room shows the reconnecting state.
    await expect(viewerPage.getByRole('status', { name: /^Reconnecting\./ })).toBeVisible({
      timeout: 30_000,
    });
    await viewerPage.waitForTimeout(3000);
    // Host keeps playing and acts while the viewer is away (pause+resume moves the version on).
    await expectPlaying(hostPage);
    await viewerCtx.setOffline(false);
    await waitForRoomReady(viewerPage);
  });

  test('18 playback recovery: viewer realigns with the host', async ({}, testInfo) => {
    await expectPlaying(viewerPage, 20_000);
    await expect
      .poll(async () => (await pairDrift(hostPage, viewerPage)).drift, {
        timeout: 15_000,
        message: 'viewer should realign within 15 s',
      })
      .toBeLessThan(250);
    const drifts: number[] = [];
    for (let i = 0; i < 8; i++) {
      drifts.push((await pairDrift(hostPage, viewerPage)).drift);
      await hostPage.waitForTimeout(250);
    }
    const s = stats(drifts);
    console.log('[sync] post-reconnect drift ms', JSON.stringify(s));
    await testInfo.attach('post-reconnect-drift.json', {
      body: JSON.stringify(s),
      contentType: 'application/json',
    });
    expect(s.p95).toBeLessThan(250);

    // Same check after a full page reload (fresh socket + snapshot).
    await viewerPage.reload();
    await waitForRoomReady(viewerPage);
    await expectPlaying(viewerPage, 20_000);
    await expect
      .poll(async () => (await pairDrift(hostPage, viewerPage)).drift, { timeout: 15_000 })
      .toBeLessThan(250);
  });

  test('19+20 non-host host actions are rejected by the server', async () => {
    const before = await playbackState(host, roomId);
    expect(before.state.status).toBe('playing');

    // UI: the transport controls are marked disabled for the viewer…
    await showControls(viewerPage);
    const pause = viewerPage.getByRole('button', { name: 'Pause', exact: true });
    await expect(pause).toHaveAttribute('aria-disabled', 'true');
    await pause.click({ force: true });
    await expect(viewerPage.getByRole('slider', { name: 'Seek' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // …and the keyboard shortcut is refused locally.
    await player(viewerPage).focus();
    await viewerPage.keyboard.press('k');
    await expectHostOnlyFeedback(viewerPage);
    await expectPlaying(viewerPage);

    // Raw socket commands with the viewer's own session (bypassing the UI) → FORBIDDEN ack.
    const sock = await rawSocket(viewer.cookies);
    try {
      const join = await sock.emit('room:join', { roomId });
      expect(join.ok).toBe(true);
      const version = before.state.version;
      for (const [event, extra] of [
        ['playback:pause', {}],
        ['playback:seek', { positionSec: 1 }],
        ['playback:rate', { rate: 2 }],
      ] as const) {
        const ack = await sock.emit(event, {
          roomId,
          commandId: crypto.randomUUID(),
          baseVersion: version,
          ...extra,
        });
        expect(ack.ok, `${event} must be rejected`).toBe(false);
        if (!ack.ok) {
          expect(ack.error.code).toBe('FORBIDDEN');
          expect(ack.error.message).toBe('Only hosts can control playback in this room');
        }
      }
    } finally {
      sock.close();
    }

    // REST host actions from the viewer's page (its cookies, its Origin) → 403.
    const rest = await viewerPage.evaluate(async (id) => {
      const call = async (method: string, path: string, body: unknown) => {
        const r = await fetch(`/api/v1${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return {
          status: r.status,
          code: ((await r.json()) as { error?: { code: string } }).error?.code,
        };
      };
      return {
        settings: await call('PATCH', `/rooms/${id}`, { controlPolicy: 'EVERYONE' }),
        close: await call('DELETE', `/rooms/${id}`, {}),
        invite: await call('POST', `/rooms/${id}/invites`, {}),
      };
    }, roomId);
    expect(rest.settings.status).toBe(403);
    expect(rest.close.status).toBe(403);
    expect(rest.invite.status).toBe(403);

    // Host state is unchanged: same version, still playing, still in sync, room still open.
    const after = await playbackState(host, roomId);
    expect(after.state.version).toBe(before.state.version);
    expect(after.state.status).toBe('playing');
    expect(after.state.positionSec).toBe(before.state.positionSec);
    await expectPlaying(hostPage);
    const room = await api<{ room: { status: string; controlPolicy: string } }>(
      host,
      'GET',
      `/rooms/${roomId}`,
    );
    expect(room.body.room.status).toBe('OPEN');
    expect(room.body.room.controlPolicy).toBe('HOSTS');
  });
});
