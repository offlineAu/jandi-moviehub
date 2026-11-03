'use client';

import { ArrowLeft, ListPlus, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { RequireAccount } from '@/components/layout/require-account';
import { MovieGridSkeleton } from '@/components/movies/movie-grid';
import { PosterCard } from '@/components/movies/poster-card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage, isApiError } from '@/lib/api';
import { useRemoveWatchlistItem, useWatchlist } from '@/lib/queries/library';
import type { Me } from '@/lib/types';
import { WatchlistOwnerMenu } from './watchlist-card-menu';

function Detail({ id, me }: { id: string; me: Me }) {
  const query = useWatchlist(id);
  const remove = useRemoveWatchlistItem(id);

  if (query.isLoading) {
    return (
      <>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-3 h-4 w-40" />
        <div className="mt-8">
          <MovieGridSkeleton count={6} />
        </div>
      </>
    );
  }
  if (query.isError || !query.data) {
    const missing =
      isApiError(query.error) && (query.error.status === 404 || query.error.status === 403);
    return missing ? (
      <EmptyState
        icon={ListPlus}
        title="This watchlist isn’t available"
        description="It may have been deleted, or you’re no longer a member."
        action={
          <Button asChild variant="secondary">
            <Link href="/library?tab=watchlists">Back to watchlists</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const { watchlist, items } = query.data;
  const isOwner = watchlist.owner.id === me.id;
  const people = [watchlist.owner, ...watchlist.members.filter((m) => m.id !== watchlist.owner.id)];

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {watchlist.name}
          </h1>
          {watchlist.description ? (
            <p className="mt-2 max-w-2xl text-muted">{watchlist.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>
              {items.length} {items.length === 1 ? 'title' : 'titles'}
            </span>
            {watchlist.isGroup ? (
              <span className="inline-flex items-center gap-2">
                <Users className="size-4" aria-hidden="true" />
                <span className="flex -space-x-2">
                  {people.slice(0, 5).map((p) => (
                    <Tooltip key={p.id} label={p.displayName}>
                      <span tabIndex={0} className="rounded-full focus-ring">
                        <Avatar
                          src={p.avatarUrl}
                          name={p.displayName}
                          size="xs"
                          className="ring-2 ring-background"
                        />
                      </span>
                    </Tooltip>
                  ))}
                </span>
                Group list
              </span>
            ) : null}
          </div>
        </div>
        {isOwner ? (
          <WatchlistOwnerMenu
            watchlist={watchlist}
            redirectAfterDelete="/library?tab=watchlists"
            className="bg-surface-raised"
          />
        ) : null}
      </header>

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title="This list is empty"
            description="Open any movie and choose Add to watchlist to save it here."
            action={
              <Button asChild variant="secondary">
                <Link href="/browse">Browse movies</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 min-[480px]:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <li key={item.id} className="relative">
                <PosterCard
                  movie={item.movie}
                  sizes="(min-width: 1280px) 200px, (min-width: 768px) 22vw, 45vw"
                />
                {item.addedBy && watchlist.isGroup ? (
                  <p className="mt-1.5 truncate text-xs text-muted">
                    Added by {item.addedBy.displayName}
                  </p>
                ) : null}
                <Tooltip label="Remove from list">
                  <button
                    type="button"
                    aria-label={`Remove ${item.movie.title} from ${watchlist.name}`}
                    onClick={() =>
                      remove.mutate(item.movie.id, {
                        onSuccess: () => toast.success(`Removed “${item.movie.title}”`),
                        onError: (error) =>
                          toast.error(errorMessage(error, 'Couldn’t remove it. Try again.')),
                      })
                    }
                    className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/15 backdrop-blur hover:bg-black/80 focus-ring"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function WatchlistDetailView({ id }: { id: string }) {
  return (
    <RequireAccount feature="Watchlists">
      {(me) => (
        <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <Link
            href="/library?tab=watchlists"
            className="mb-5 inline-flex items-center gap-1.5 rounded text-sm text-muted hover:text-foreground focus-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Watchlists
          </Link>
          <Detail id={id} me={me} />
        </div>
      )}
    </RequireAccount>
  );
}
