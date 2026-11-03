import { Play, Star } from 'lucide-react';
import Link from 'next/link';
import { PosterMorph } from '@/components/motion/view-transition';
import { Tilt } from '@/components/motion/tilt';
import { Badge } from '@/components/ui/badge';
import type { MovieSummary } from '@/lib/types';
import { cn, formatRating } from '@/lib/utils';
import { Artwork } from './artwork';

export function PosterCard({
  movie,
  className,
  priority,
  sizes = '(min-width: 1280px) 200px, (min-width: 768px) 180px, 42vw',
  progress,
  href,
  morph,
}: {
  movie: MovieSummary;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** 0–1: renders a progress bar (continue watching). */
  progress?: number;
  href?: string;
  /** Morph this poster into the detail page's poster on navigation (ids must be unique on the page). */
  morph?: boolean;
}) {
  const rating = formatRating(movie.voteAverage);
  const label = [movie.title, movie.year ? `(${movie.year})` : null].filter(Boolean).join(' ');
  return (
    <article className={cn('group/poster relative', className)}>
      <Link
        href={href ?? `/movies/${movie.id}`}
        className="block rounded-xl outline-none focus-visible:shadow-[var(--shadow-glow)]"
        aria-label={`${label}${rating ? `, rated ${rating} out of 10` : ''}${movie.playable ? ', available to stream' : ''}${movie.isDemo ? ', demo title' : ''}`}
      >
        <Tilt className="rounded-xl" max={7}>
          <div className="sheen relative aspect-[2/3] overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-white/[0.06] transition-[transform,box-shadow] duration-500 ease-[var(--ease-expo)] group-hover/poster:-translate-y-1.5 group-hover/poster:shadow-[var(--shadow-lift)] group-focus-within/poster:-translate-y-1.5">
            {morph ? (
              <PosterMorph id={movie.id}>
                <div className="absolute inset-0">
                  <Artwork
                    src={movie.posterUrl}
                    alt=""
                    sizes={sizes}
                    priority={priority}
                    fallbackTitle={movie.title}
                    className="transition-transform duration-700 ease-[var(--ease-expo)] group-hover/poster:scale-[1.07]"
                  />
                </div>
              </PosterMorph>
            ) : (
              <Artwork
                src={movie.posterUrl}
                alt=""
                sizes={sizes}
                priority={priority}
                fallbackTitle={movie.title}
                className="transition-transform duration-700 ease-[var(--ease-expo)] group-hover/poster:scale-[1.07]"
              />
            )}
            {movie.isDemo ? (
              <Badge variant="demo" className="absolute right-2 top-2 z-10 px-1.5 py-0 text-[11px]">
                Demo
              </Badge>
            ) : null}
            <div className="absolute inset-0 flex translate-y-2 flex-col justify-end bg-gradient-to-t from-black/95 via-black/55 to-transparent p-3 opacity-0 transition-[opacity,transform] duration-500 ease-[var(--ease-expo)] group-hover/poster:translate-y-0 group-hover/poster:opacity-100 group-focus-within/poster:translate-y-0 group-focus-within/poster:opacity-100">
              <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-white">
                {movie.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/80">
                {movie.year ? <span>{movie.year}</span> : null}
                {rating ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="size-3 fill-warning text-warning" aria-hidden="true" />
                    {rating}
                  </span>
                ) : null}
              </div>
              {movie.playable ? (
                <Badge variant="playable" className="mt-2 w-fit">
                  <Play className="fill-current" aria-hidden="true" />
                  Playable
                </Badge>
              ) : null}
            </div>
            {progress !== undefined ? (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15" aria-hidden="true">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }}
                />
              </div>
            ) : null}
          </div>
        </Tilt>
      </Link>
      {/* Touch devices can't hover: show the essentials below the poster instead. */}
      <div className="mt-2 hidden px-0.5 pointer-coarse:block" aria-hidden="true">
        <p className="line-clamp-1 text-sm font-medium">{movie.title}</p>
        <p className="flex items-center gap-2 text-xs text-muted">
          {movie.year ?? '—'}
          {movie.playable ? <span className="text-[#6ee7b7]">Playable</span> : null}
        </p>
      </div>
    </article>
  );
}

export function PosterCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('shimmer aspect-[2/3] rounded-xl ring-1 ring-white/[0.04]', className)}
      aria-hidden="true"
    />
  );
}
