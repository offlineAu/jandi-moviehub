import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** Logs in through the real form (covers the journey). */
export async function loginViaUi(page: Page, email: string, password: string, next = '/') {
  await page.goto(`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** The player region of the room / watch page. */
export const player = (page: Page) => page.getByRole('region', { name: /^Video player:/ });

/** The room chat message list. */
export const chatLog = (page: Page) => page.getByRole('log', { name: 'Chat messages' });

export async function sendChat(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Message the room' });
  await input.fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(chatLog(page).getByText(text, { exact: true })).toBeVisible();
}

/** Waits until the room page has joined the realtime channel and is in sync. */
export async function waitForRoomReady(page: Page) {
  await expect(
    page.getByRole('status', { name: /^(In sync|Adjusting|Catching up)\./ }),
  ).toBeVisible({ timeout: 20_000 });
}

export interface AxeSummary {
  url: string;
  blocking: Array<{ id: string; impact: string; help: string; nodes: number; targets: string[] }>;
  moderate: Array<{ id: string; impact: string; help: string; nodes: number; targets: string[] }>;
}

/** Runs axe (WCAG 2 A + AA) and returns serious/critical vs. moderate/minor violations. */
export async function axeScan(page: Page, testInfo: TestInfo, label: string): Promise<AxeSummary> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const map = (v: (typeof results.violations)[number]) => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  });
  const summary: AxeSummary = {
    url: page.url(),
    blocking: results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(map),
    moderate: results.violations
      .filter((v) => v.impact !== 'serious' && v.impact !== 'critical')
      .map(map),
  };
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  console.log(
    `[axe] ${label}: ${summary.blocking.length} serious/critical, ${summary.moderate.length} moderate/minor` +
      (summary.blocking.length + summary.moderate.length
        ? ` → ${[...summary.blocking, ...summary.moderate].map((v) => `${v.id}(${v.impact}×${v.nodes})`).join(', ')}`
        : ''),
  );
  return summary;
}

/** True if the page scrolls horizontally. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

/** The player's "host only" refusal: a visual flash plus a screen-reader announcement. */
export async function expectHostOnlyFeedback(page: Page) {
  const text = 'Only hosts can control playback';
  await expect(page.locator('div[aria-hidden="true"]').filter({ hasText: text })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: text })).toHaveCount(1);
}
