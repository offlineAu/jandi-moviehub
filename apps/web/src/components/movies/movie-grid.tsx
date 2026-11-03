import { Reveal } from '@/components/motion/reveal';
import type { MovieSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PosterCard, PosterCardSkeleton } from './poster-card';

const gridClass =
  'grid grid-cols-2 gap-x-3 gap-y-5 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-x-4';

export function MovieGrid({ movies, className }: { movies: MovieSummary[]; className?: string }) {
  return (
    <ul className={cn(gridClass, className)}>
      {movies.map((movie, i) => (
        <li key={movie.id}>
          {/* Each poster rises as its row enters; columns are offset so a row ripples left to right. */}
          <Reveal y={28} delay={(i % 6) * 0.05}>
            <PosterCard
              movie={movie}
              morph
              priority={i < 6}
              sizes="(min-width: 1280px) 200px, (min-width: 768px) 22vw, 45vw"
            />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

export function MovieGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={gridClass} aria-busy="true" aria-label="Loading titles">
      {Array.from({ length: count }, (_, i) => (
        <PosterCardSkeleton key={i} />
      ))}
    </div>
  );
}
