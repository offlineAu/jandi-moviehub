'use client';

import { ArrowRight, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { hasAccountBanner } from '@/components/layout/account-banners';
import { HeroBillboard, HeroBillboardSkeleton } from '@/components/movies/hero-billboard';
import { GenreChips } from '@/components/movies/genre-chips';
import { MovieRail } from '@/components/movies/movie-rail';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useMe } from '@/lib/queries/auth';
import { useMovies } from '@/lib/queries/catalog';
import { useContinueWatching } from '@/lib/queries/library';
import type { MovieListParams } from '@/lib/types';
import { ValueProp } from './value-prop';
import { YourRoomsRail } from './your-rooms-rail';

function SeeAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="group/see mr-1 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground focus-ring"
    >
      See all
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 transition-transform duration-300 ease-[var(--ease-expo)] group-hover/see:translate-x-1"
      />
    </Link>
  );
}

function CategoryRail({
  title,
  description,
  params,
  href,
}: {
  title: string;
  description?: string;
  params: MovieListParams;
  href: string;
}) {
  const query = useMovies({ pageSize: 20, ...params });
  return (
    <MovieRail
      title={title}
      description={description}
      movies={query.data?.items}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      action={<SeeAll href={href} />}
    />
  );
}

function ContinueWatchingRail() {
  const query = useContinueWatching();
  const items = query.data?.items;
  const progress = new Map(
    items?.map((h) => [h.movie.id, h.durationSec ? h.positionSec / h.durationSec : 0]),
  );
  return (
    <MovieRail
      title="Continue watching"
      movies={items?.map((h) => h.movie)}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      progressFor={(m) => progress.get(m.id)}
      action={<SeeAll href="/library?tab=continue" />}
    />
  );
}

export function HomeView() {
  const me = useMe();
  const trending = useMovies({ category: 'trending', pageSize: 20 });
  const user = me.data;
  const items = trending.data?.items;
  const withBackdrop = items?.filter((m) => m.backdropUrl) ?? [];
  const featured = (withBackdrop.length ? withBackdrop : (items ?? [])).slice(0, 5);

  return (
    <div className={hasAccountBanner(user) ? 'pb-4' : '-mt-16 pb-4'}>
      {trending.isLoading ? (
        <HeroBillboardSkeleton />
      ) : trending.isError ? (
        <div className="px-4 pb-6 pt-28 sm:px-6 lg:px-10">
          <ErrorState
            title="The catalog didn’t load"
            error={trending.error}
            onRetry={() => void trending.refetch()}
            retrying={trending.isFetching}
          />
        </div>
      ) : featured.length ? (
        <HeroBillboard movies={featured} eyebrow="Trending this week" />
      ) : (
        <div className="px-4 pb-6 pt-28 sm:px-6 lg:px-10">
          <EmptyState
            icon={Clapperboard}
            title="The catalog is empty"
            description="No titles have been added yet. Check back soon."
          />
        </div>
      )}

      <div className="relative z-[3] mt-2 grid grid-cols-1 gap-10 sm:mt-0 sm:gap-12">
        {user ? <YourRoomsRail /> : null}
        {user && !user.isGuest ? <ContinueWatchingRail /> : null}
        <MovieRail
          title="Trending now"
          movies={items}
          isLoading={trending.isLoading}
          error={trending.isError ? trending.error : undefined}
          onRetry={() => void trending.refetch()}
          action={<SeeAll href="/browse?sort=popularity" />}
        />
        <CategoryRail
          title="Ready to stream"
          description="Licensed titles you can play right now — solo or in a watch party."
          params={{ playable: true, sort: 'popularity' }}
          href="/browse?playable=true"
        />
        {!me.isLoading && !user ? <ValueProp posters={items} /> : null}
        <CategoryRail
          title="Recently released"
          params={{ category: 'recent' }}
          href="/browse?sort=release"
        />
        <CategoryRail
          title="Popular"
          params={{ category: 'popular' }}
          href="/browse?sort=popularity"
        />
        <CategoryRail
          title="Top rated"
          params={{ category: 'top-rated' }}
          href="/browse?sort=rating"
        />
        <CategoryRail
          title="Coming soon"
          params={{ category: 'upcoming' }}
          href="/browse?sort=release"
        />
        <GenreChips />
      </div>
    </div>
  );
}
