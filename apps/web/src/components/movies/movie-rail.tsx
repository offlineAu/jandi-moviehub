'use client';

import type { ReactNode } from 'react';
import { Stagger, StaggerItem } from '@/components/motion/reveal';
import { ErrorState } from '@/components/ui/error-state';
import { ScrollRail } from '@/components/ui/scroll-rail';
import type { MovieSummary } from '@/lib/types';
import { PosterCard, PosterCardSkeleton } from './poster-card';

const itemClass =
  'w-[38vw] max-w-[180px] shrink-0 snap-start sm:w-[160px] lg:w-[180px] xl:w-[196px] xl:max-w-[196px]';

export function MovieRail({
  title,
  description,
  movies,
  isLoading,
  error,
  onRetry,
  action,
  emptyText,
  progressFor,
}: {
  title: string;
  description?: ReactNode;
  movies: MovieSummary[] | undefined;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  action?: ReactNode;
  /** When provided, an empty rail renders this text; otherwise an empty rail is hidden. */
  emptyText?: string;
  progressFor?: (movie: MovieSummary) => number | undefined;
}) {
  if (error && !movies) {
    return (
      <section aria-label={title} className="px-4 sm:px-6 lg:px-10">
        <h2 className="mb-3 font-display text-lg font-semibold sm:text-xl">{title}</h2>
        <ErrorState compact title={`${title} didn’t load`} error={error} onRetry={onRetry} />
      </section>
    );
  }
  if (!isLoading && movies && movies.length === 0) {
    if (!emptyText) return null;
    return (
      <section aria-label={title} className="px-4 sm:px-6 lg:px-10">
        <h2 className="mb-2 font-display text-lg font-semibold sm:text-xl">{title}</h2>
        <p className="text-sm text-muted">{emptyText}</p>
      </section>
    );
  }
  return (
    <ScrollRail
      title={title}
      description={description}
      action={action}
      itemCount={movies?.length ?? 0}
    >
      {isLoading || !movies ? (
        <div className="flex gap-3 sm:gap-4" aria-busy="true" aria-label={`Loading ${title}`}>
          {Array.from({ length: 8 }, (_, i) => (
            <PosterCardSkeleton key={i} className={itemClass} />
          ))}
        </div>
      ) : (
        <Stagger as="ul" className="flex gap-3 sm:gap-4" stagger={0.06}>
          {movies.map((movie) => (
            <StaggerItem as="li" variant="slide" key={movie.id} className={itemClass}>
              <PosterCard movie={movie} progress={progressFor?.(movie)} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </ScrollRail>
  );
}
