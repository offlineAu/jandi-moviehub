/** Hand-written fixtures shaped like TMDB v3 responses (values are illustrative test data). */
import type { TmdbGenre, TmdbMovieDetails, TmdbPage } from '../tmdb.types';

export const genreList: { genres: TmdbGenre[] } = {
  genres: [
    { id: 28, name: 'Action' },
    { id: 18, name: 'Drama' },
    { id: 878, name: 'Science Fiction' },
  ],
};

const item = (id: number, title: string, extra: Partial<TmdbPage['results'][number]> = {}) => ({
  adult: false,
  backdrop_path: `/backdrop${id}.jpg`,
  genre_ids: [18],
  id,
  original_language: 'en',
  original_title: title,
  overview: `Overview for ${title}.`,
  popularity: 100 - id / 1000,
  poster_path: `/poster${id}.jpg`,
  release_date: '2024-05-17',
  title,
  video: false,
  vote_average: 7.1,
  vote_count: 1234,
  ...extra,
});

export function listPage(page: number, totalPages = 3, perPage = 20): TmdbPage {
  return {
    page,
    results: Array.from({ length: perPage }, (_, i) =>
      item(page * 1000 + i, `Fixture ${page}-${i}`, { genre_ids: [18, 878] }),
    ),
    total_pages: totalPages,
    total_results: totalPages * perPage,
  };
}

export const details: TmdbMovieDetails = {
  ...item(550, 'Fixture Feature', { vote_average: 8.4, vote_count: 30000 }),
  genres: [
    { id: 18, name: 'Drama' },
    { id: 28, name: 'Action' },
  ],
  runtime: 139,
  tagline: 'A tagline.',
  credits: {
    cast: [
      { name: 'Second Billed', character: 'Role B', profile_path: '/b.jpg', order: 1 },
      { name: 'Top Billed', character: 'Role A', profile_path: null, order: 0 },
    ],
  },
  videos: {
    results: [
      { site: 'YouTube', key: 'teaserKey01', name: 'Teaser', type: 'Teaser', official: true },
      {
        site: 'YouTube',
        key: 'trailerKey1',
        name: 'Official Trailer',
        type: 'Trailer',
        official: true,
      },
      {
        site: 'YouTube',
        key: 'bts1',
        name: 'Behind the scenes',
        type: 'Featurette',
        official: true,
      },
      { site: 'Dailymotion', key: 'x1', name: 'Other host', type: 'Trailer', official: false },
    ],
  },
  similar: {
    page: 1,
    results: [item(551, 'Similar One'), item(552, 'Similar Two', { adult: true })],
    total_pages: 1,
    total_results: 2,
  },
  recommendations: {
    page: 1,
    results: [item(553, 'Recommended One')],
    total_pages: 1,
    total_results: 1,
  },
};
