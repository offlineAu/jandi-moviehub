import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { HOME_MOVIE_LISTS, HOME_TRENDING } from '@/components/home/home-rails';
import { HomeView } from '@/components/home/home-view';
import { qk } from '@/lib/queries/keys';
import { prefetchMovieLists } from '@/lib/queries/prefetch-movies';

/**
 * Incremental static regeneration: the page (with its movie lists) is rendered at most once per
 * window, in the background, and every visit is served from the CDN cache — visits never invoke a
 * function. The lists are viewer-independent; everything per-user loads on the client.
 */
export const revalidate = 300;

/** Background regeneration at runtime (not `next build`, not the dev server). */
const isRegenerating = () =>
  process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build';

export default async function HomePage() {
  const queryClient = new QueryClient();
  await prefetchMovieLists(queryClient, HOME_MOVIE_LISTS);
  // Without the hero's list the regenerated page would be a skeleton. Failing the regeneration
  // keeps serving the last good page and retries on a later request. At build time (API maybe
  // unreachable) render anyway: the client fetches whatever is missing.
  if (isRegenerating() && !queryClient.getQueryData(qk.movies(HOME_TRENDING))) {
    throw new Error('Home page regeneration skipped: trending list unavailable');
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeView />
    </HydrationBoundary>
  );
}
