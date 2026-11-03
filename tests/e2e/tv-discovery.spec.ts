import { expect, test } from '@playwright/test';
import { loginAs, registerUser } from './support/api';

test('TV metadata and regional provider destinations remain distinct from playback', async ({
  page,
}) => {
  await page.route('**/api/v1/tv/search?**', async (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 71446,
            title: 'Money Heist',
            originalTitle: 'La Casa de Papel',
            overview: '',
            posterUrl: null,
            backdropUrl: null,
            firstAirDate: '2017-05-02',
          },
        ],
        page: 1,
        totalPages: 1,
      },
    }),
  );
  await page.route('**/api/v1/tv/71446/seasons/1', async (route) =>
    route.fulfill({
      json: {
        season: {
          name: 'Part 1',
          overview: '',
          episodes: [
            {
              id: 1,
              number: 1,
              title: 'Episode 1',
              overview: 'Episode description',
              playable: false,
            },
          ],
        },
      },
    }),
  );
  await page.route('**/api/v1/tv/71446/seasons/*/episodes/*', async (route) => {
    const second = route.request().url().endsWith('/2');
    const episode = {
      number: second ? 2 : 1,
      seasonNumber: second ? 2 : 1,
      title: second ? 'Episode 2' : 'Episode 1',
      overview: 'Episode description',
      airDate: null,
      runtimeMin: null,
      stillUrl: null,
    };
    await route.fulfill({
      json: {
        episode,
        previous: second ? { ...episode, seasonNumber: 1, number: 1 } : null,
        next: second ? null : { ...episode, seasonNumber: 2, number: 2 },
      },
    });
  });
  await page.route('**/api/v1/tv/71446', async (route) =>
    route.fulfill({
      json: {
        series: {
          id: 71446,
          title: 'Money Heist',
          originalTitle: 'La Casa de Papel',
          overview: 'Synopsis',
          posterUrl: null,
          backdropUrl: null,
          firstAirDate: '2017-05-02',
          seasons: [{ season_number: 1, name: 'Part 1', episode_count: 1 }],
          cast: [],
          playback: 'UNAVAILABLE',
        },
      },
    }),
  );
  await page.route('**/api/v1/availability/tv/71446?**', async (route) =>
    route.fulfill({
      json: {
        items: [
          {
            provider: 'Example provider',
            type: 'sub',
            price: null,
            url: 'https://example.com/title',
          },
        ],
      },
    }),
  );
  await page.goto('/search');
  await page
    .getByRole('searchbox', { name: 'Search movies and TV by title' })
    .fill('La Casa de Papel');
  await page.locator('a[href="/tv/71446"]').click();
  await expect(
    page.getByText(
      'Episode playback depends on approved media. Open an episode to check availability.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Choose a season')).toHaveValue('1');
  await expect(page.getByText('Episode description')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open provider' })).toHaveAttribute(
    'href',
    'https://example.com/title',
  );
  await expect(page.getByRole('link', { name: 'Watchmode' })).toBeVisible();
  await page.getByRole('link', { name: 'View episode 1' }).click();
  await expect(page).toHaveURL(/\/watch\/tv\/71446\/season\/1\/episode\/1$/);
  await expect(
    page.getByText('Full-episode playback is not currently available in Jandi MovieHub.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Next episode' }).click();
  await expect(page).toHaveURL(/\/season\/2\/episode\/2$/);
  await expect(page.getByRole('link', { name: 'Previous episode' })).toBeVisible();
});

test('@mobile episode page fits a narrow screen and shows the unavailable status', async ({
  page,
}) => {
  await page.route('**/api/v1/tv/71446', async (route) =>
    route.fulfill({ json: { series: { title: 'Money Heist' } } }),
  );
  await page.route('**/api/v1/tv/71446/seasons/1/episodes/1', async (route) =>
    route.fulfill({
      json: {
        episode: {
          number: 1,
          title: 'Episode 1',
          overview: 'Episode description',
          airDate: null,
          runtimeMin: null,
          stillUrl: null,
        },
        previous: null,
        next: { number: 2, seasonNumber: 1 },
      },
    }),
  );
  await page.goto('/watch/tv/71446/season/1/episode/1');
  await expect(
    page.getByText('Full-episode playback is not currently available in Jandi MovieHub.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Next episode' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('saved TV series can be reopened from the library', async ({ page, context }) => {
  const user = await registerUser('tvsaved');
  await loginAs(context, user);
  let saved = false;
  let visited = false;
  await page.route('**/api/v1/tv/71446', async (route) =>
    route.fulfill({
      json: {
        series: {
          id: 71446,
          title: 'Money Heist',
          originalTitle: null,
          overview: '',
          posterUrl: null,
          backdropUrl: null,
          firstAirDate: null,
          seasons: [],
          cast: [],
          playback: 'UNAVAILABLE',
        },
      },
    }),
  );
  await page.route('**/api/v1/saved-tv**', async (route) => {
    if (route.request().method() === 'PUT') saved = true;
    if (route.request().method() === 'DELETE') saved = false;
    await route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { items: saved ? [{ tmdbId: 71446, title: 'Money Heist', posterUrl: null }] : [] }
          : {},
    });
  });
  await page.route('**/api/v1/recent-tv**', async (route) => {
    if (route.request().method() === 'PUT') visited = true;
    if (route.request().method() === 'DELETE') visited = false;
    await route.fulfill({
      json:
        route.request().method() === 'GET'
          ? {
              items: visited
                ? [{ tmdbId: 71446, title: 'Money Heist', season: null, episode: null }]
                : [],
            }
          : {},
    });
  });
  await page.goto('/tv/71446');
  await page.getByRole('button', { name: 'Add to TV watchlist' }).click();
  await expect(page.getByRole('button', { name: 'Remove from TV watchlist' })).toBeVisible();
  await page.goto('/library?tab=watchlists');
  await page.getByRole('link', { name: /Money Heist/ }).click();
  await expect(page).toHaveURL(/\/tv\/71446$/);
  await page.getByRole('button', { name: 'Remove from TV watchlist' }).click();
  await expect(page.getByRole('button', { name: 'Add to TV watchlist' })).toBeVisible();
  await page.goto('/library?tab=history');
  await expect(page.getByRole('heading', { name: 'Recently viewed TV pages' })).toBeVisible();
  await page.getByRole('link', { name: 'Money Heist' }).click();
  await expect(page).toHaveURL(/\/tv\/71446$/);
});

test('TV genre browse uses the TV genre list and shows matching series', async ({ page }) => {
  await page.route('**/api/v1/tv/genres', (route) =>
    route.fulfill({ json: { items: [{ id: 18, name: 'Drama', slug: 'drama' }] } }),
  );
  await page.route('**/api/v1/tv/discover?**', (route) =>
    route.fulfill({
      json: { items: [{ id: 71446, title: 'Example series', firstAirDate: null }] },
    }),
  );
  await page.goto('/series');
  await page.getByLabel('TV genre', { exact: true }).selectOption('drama');
  await expect(page.getByRole('link', { name: /Example series/ })).toHaveAttribute(
    'href',
    '/tv/71446',
  );
});
