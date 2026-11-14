import type { MovieListParams } from '../types';

/** `GET /movies` query string for a `useMovies` params object (shared by client and server). */
export function movieListQuery(params: MovieListParams) {
  return {
    category: params.category,
    genre: params.genre,
    q: params.q,
    year: params.year,
    minRating: params.minRating,
    playable: params.playable ? 'true' : undefined,
    sort: params.sort,
    page: params.page,
    pageSize: params.pageSize,
  };
}
