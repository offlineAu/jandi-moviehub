import { expect, test } from '@playwright/test';
import { devMail, newUserData } from './support/api';
import { loginViaUi } from './support/ui';

/**
 * Scenarios 1–5: register, log in, browse, search, watchlist → library. Serial: one account
 * created through the UI is reused by the following steps.
 */
test.describe.serial('account journey', () => {
  const account = newUserData('reg');

  test('01 register via UI', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Display name').fill(account.displayName);
    await page.getByLabel('Username').fill(account.username);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('button', { name: `Account menu for ${account.displayName}` }),
    ).toBeVisible();
    // A confirmation mail was "sent" through the dev transport.
    await expect
      .poll(async () => (await devMail(account.email)).items.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  test('02 log in via UI', async ({ page }) => {
    // Wrong password first: clear inline error, still logged out.
    await loginViaUi(page, account.email, 'not-the-password');
    await expect(
      page.getByRole('alert').filter({ hasText: 'don’t match an account' }),
    ).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('button', { name: `Account menu for ${account.displayName}` }),
    ).toBeVisible();
  });

  test('03 browse movies', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.getByRole('heading', { level: 1, name: 'Browse' })).toBeVisible();
    await expect(page.getByText(/^\d[\d,]* titles?$/)).toBeVisible();
    const cards = page.getByRole('link', { name: /available to stream/ });
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);

    // Open a detail page from the grid.
    await page
      .getByRole('link', { name: /^Neon Drift/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/movies\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Neon Drift' })).toBeVisible();
    // The detail header's badge comes first (similar-title rails also carry badges).
    await expect(page.getByText('Playable', { exact: true }).first()).toBeVisible();
  });

  test('04 search', async ({ page }) => {
    await page.goto('/search');
    const box = page
      .getByRole('searchbox', { name: 'Search movies and TV by title' })
      .or(page.getByRole('textbox', { name: 'Search movies and TV by title' }));
    await box.fill('paper moon');
    await expect(page).toHaveURL(/[?&]q=paper(\+|%20)moon/);
    await expect(page.getByRole('link', { name: /^Paper Moon Courier/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Neon Drift/ })).toHaveCount(0);

    await box.fill('zzqx-no-such-title');
    await expect(page.getByRole('heading', { name: /No movie results for/ })).toBeVisible();
  });

  test('05 add to watchlist and see it in the library', async ({ page }) => {
    await loginViaUi(page, account.email, account.password, '/browse');
    await expect(page).toHaveURL(/\/browse/);
    await page
      .getByRole('link', { name: /^The Last Projectionist/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'The Last Projectionist' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Add to watchlist' }).click();
    await page.getByRole('menuitemcheckbox', { name: /My Watchlist/ }).click();
    await expect(page.getByText('Added to “My Watchlist”')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'In 1 list' })).toBeVisible();

    await page.goto('/library?tab=watchlists');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Watchlists/, selected: true })).toBeVisible();
    const card = page.getByRole('link', { name: 'My Watchlist' });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/library\/watchlists\//);
    await expect(
      page.getByRole('button', { name: 'Remove The Last Projectionist from My Watchlist' }),
    ).toBeVisible();
  });
});
