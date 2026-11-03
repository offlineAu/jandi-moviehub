'use client';

import Link from 'next/link';
import { Stagger, StaggerItem } from '@/components/motion/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { useGenres } from '@/lib/queries/catalog';
import { cn } from '@/lib/utils';

export const chipClass =
  'inline-flex h-9 shrink-0 items-center rounded-full border border-border-strong bg-white/[0.03] px-4 text-sm font-medium text-foreground/90 transition-[border-color,background-color,transform,box-shadow] duration-300 ease-[var(--ease-expo)] hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:shadow-[0_8px_24px_-12px_rgb(168_85_247/0.6)] active:scale-95 focus-ring';

export function GenreChips({ className }: { className?: string }) {
  const genres = useGenres();
  if (genres.isError) return null;
  return (
    <nav aria-label="Browse by genre" className={cn('px-4 sm:px-6 lg:px-10', className)}>
      <h2 className="mb-4 font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
        Browse by genre
      </h2>
      {genres.isLoading ? (
        <ul className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-9 w-24 rounded-full" />
            </li>
          ))}
        </ul>
      ) : (
        <Stagger as="ul" className="flex flex-wrap gap-2" stagger={0.03}>
          {genres.data?.items.map((genre) => (
            <StaggerItem as="li" variant="pop" key={genre.id}>
              <Link href={`/browse?genre=${encodeURIComponent(genre.slug)}`} className={chipClass}>
                {genre.name}
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </nav>
  );
}
