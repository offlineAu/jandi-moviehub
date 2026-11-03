'use client';

import { Heart, HeartOff } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { MovieGridSkeleton } from '@/components/movies/movie-grid';
import { PosterCard } from '@/components/movies/poster-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { useFavorites, useRemoveFavorite } from '@/lib/queries/library';

export function FavoritesTab({
  page,
  onPageChange,
}: {
  page: number;
  onPageChange: (page: number) => void;
}) {
  const query = useFavorites(page);
  const remove = useRemoveFavorite(page);
  if (query.isLoading) return <MovieGridSkeleton count={12} />;
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  const data = query.data;
  if (!data?.items.length) {
    return (
      <EmptyState
        icon={Heart}
        title="No favorites yet"
        description="Tap Favorite on any movie to keep it here."
        action={
          <Button asChild variant="secondary">
            <Link href="/browse">Browse movies</Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 min-[480px]:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {data.items.map(({ movie }) => (
          <li key={movie.id} className="relative">
            <PosterCard
              movie={movie}
              sizes="(min-width: 1280px) 200px, (min-width: 768px) 22vw, 45vw"
            />
            <Tooltip label="Remove from favorites">
              <button
                type="button"
                aria-label={`Remove ${movie.title} from favorites`}
                onClick={() =>
                  remove.mutate(movie.id, {
                    onSuccess: () => toast.success(`Removed “${movie.title}” from favorites`),
                    onError: (error) =>
                      toast.error(errorMessage(error, 'Couldn’t remove the favorite. Try again.')),
                  })
                }
                className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-black/60 text-accent ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-black/80 focus-ring"
              >
                <HeartOff className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      <Pagination
        className="mt-10"
        page={data.page}
        totalPages={data.totalPages}
        onPageChange={onPageChange}
      />
    </>
  );
}
