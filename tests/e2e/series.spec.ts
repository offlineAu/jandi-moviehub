import { expect, test } from '@playwright/test';

test('series browsing presents ordered playable and unavailable episodes', async ({ page }) => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  await page.route('**/api/v1/series**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(`/series/${id}`)) {
      await route.fulfill({
        json: {
          series: {
            id,
            title: 'Example drama',
            country: 'Korea',
            description: 'A test series.',
            episodes: [
              {
                id: '1',
                seasonNumber: 1,
                episodeNumber: 1,
                movie: {
                  id: '123e4567-e89b-42d3-a456-426614174001',
                  title: 'First episode',
                  runtimeMin: 10,
                  playable: true,
                },
              },
              {
                id: '2',
                seasonNumber: 1,
                episodeNumber: 2,
                movie: {
                  id: '123e4567-e89b-42d3-a456-426614174002',
                  title: 'Second episode',
                  runtimeMin: 10,
                  playable: false,
                },
              },
            ],
          },
        },
      });
    } else {
      await route.fulfill({
        json: {
          items: [
            {
              id,
              title: 'Example drama',
              description: 'A test series.',
              country: 'Korea',
              episodeCount: 2,
            },
          ],
          page: 1,
          totalPages: 1,
        },
      });
    }
  });
  await page.goto('/series');
  await page.getByRole('link', { name: /Example drama/ }).click();
  await expect(page.getByRole('heading', { name: 'Example drama' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Watch episode' })).toHaveAttribute(
    'href',
    '/watch/123e4567-e89b-42d3-a456-426614174001',
  );
  await expect(page.getByText('Not available to watch')).toBeVisible();
});
