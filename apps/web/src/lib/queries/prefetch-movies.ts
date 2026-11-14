import type { QueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type { MovieListParams, MovieSummary, Paginated } from '../types';
import { qk } from './keys';
import { movieListQuery } from './movie-list';

/** Server-side prefetches are shared by every visitor through the Next data cache. */
const REVALIDATE_SEC = 300;
/**
 * Upper bound on a prefetch. In production the home page regenerates in the background (ISR), so
 * no visitor waits on this and a slow API can be given longer; the dev server renders per
 * request, so it stays short there. Past it, the client fetches whatever is missing.
 */
const TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 5000 : 1500;

/**
 * Prefetches public movie lists on the server so they arrive in the HTML instead of after
 * hydration. Lists are viewer-independent, so no cookies are forwarded. Failures and timeouts are
 * swallowed (`prefetchQuery` never throws) and failed queries are not dehydrated.
 */
export function prefetchMovieLists(client: QueryClient, lists: MovieListParams[]) {
  return Promise.all(
    lists.map((params) =>
      client.prefetchQuery({
        queryKey: qk.movies(params),
        queryFn: () =>
          apiFetch<Paginated<MovieSummary>>('/movies', {
            query: movieListQuery(params),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            next: { revalidate: REVALIDATE_SEC },
          }),
        retry: false,
      }),
    ),
  );
}
