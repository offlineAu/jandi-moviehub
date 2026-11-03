'use client';

import { Clock, Play } from 'lucide-react';
import Link from 'next/link';
import { Artwork } from '@/components/movies/artwork';
import { MovieGridSkeleton } from '@/components/movies/movie-grid';
import { formatTime } from '@/components/player/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useContinueWatching } from '@/lib/queries/library';

export function ContinueTab() {
  const query = useContinueWatching();
  if (query.isLoading) return <MovieGridSkeleton count={6} />;
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  const items = query.data?.items ?? [];
  if (!items.length) {
    return (
      <EmptyState
        icon={Clock}
        title="Nothing in progress"
        description="Movies you start watching show up here so you can resume from the exact moment you stopped."
        action={
          <Button asChild variant="secondary">
            <Link href="/browse?playable=true">Find something to stream</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((entry) => {
        const pct = entry.durationSec
          ? Math.min(100, (entry.positionSec / entry.durationSec) * 100)
          : 0;
        const remaining = Math.max(0, entry.durationSec - entry.positionSec);
        return (
          <li key={entry.movie.id}>
            <Link
              href={`/watch/${entry.movie.id}`}
              className="group block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-primary/40 focus-ring"
            >
              <div className="relative aspect-video overflow-hidden">
                <Artwork
                  src={entry.movie.backdropUrl ?? entry.movie.posterUrl}
                  alt=""
                  sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                  kind="backdrop"
                  fallbackTitle={entry.movie.title}
                  className="transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
                <span className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 opacity-0 ring-1 ring-white/30 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Play className="size-5 translate-x-0.5 fill-current" aria-hidden="true" />
                </span>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
                  <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.movie.title}</p>
                  <p className="text-xs text-muted">
                    {formatTime(entry.positionSec)} watched, {formatTime(remaining)} left
                  </p>
                </div>
                {entry.movie.isDemo ? (
                  <span className="text-xs font-medium text-warning">Demo</span>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
