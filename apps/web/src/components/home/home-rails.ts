import type { MovieListParams } from '@/lib/types';

/**
 * Movie lists the home page renders. Shared by `HomeView` (client queries) and the home route
 * (server prefetch) so their React Query keys always match.
 */
export const HOME_TRENDING: MovieListParams = { category: 'trending', pageSize: 20 };

export interface HomeCategoryRail {
  title: string;
  description?: string;
  params: MovieListParams;
  href: string;
}

const rail = (
  title: string,
  params: MovieListParams,
  href: string,
  description?: string,
): HomeCategoryRail => ({ title, description, params: { pageSize: 20, ...params }, href });

export const HOME_READY_TO_STREAM = rail(
  'Ready to stream',
  { playable: true, sort: 'popularity' },
  '/browse?playable=true',
  'Licensed titles you can play right now — solo or in a watch party.',
);

/** Category rails shown after the "Ready to stream" rail, in order. */
export const HOME_CATEGORY_RAILS: HomeCategoryRail[] = [
  rail('Recently released', { category: 'recent' }, '/browse?sort=release'),
  rail('Popular', { category: 'popular' }, '/browse?sort=popularity'),
  rail('Top rated', { category: 'top-rated' }, '/browse?sort=rating'),
  rail('Coming soon', { category: 'upcoming' }, '/browse?sort=release'),
];

export const HOME_MOVIE_LISTS: MovieListParams[] = [
  HOME_TRENDING,
  HOME_READY_TO_STREAM.params,
  ...HOME_CATEGORY_RAILS.map((r) => r.params),
];
