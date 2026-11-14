import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * One loading vocabulary for the whole app.
 *
 * `LoadingBlock` is for a region whose shape is unknown (a detail page, a list of rows).
 * `LoadingCards` is for a grid of tiles. `LoadingLines` is for a short text block.
 *
 * All three reserve the space the content will occupy, so nothing jumps when the data lands,
 * and they announce themselves as busy so screen readers say "loading" rather than going quiet.
 */
export function LoadingBlock({
  label,
  className,
  rows = 3,
}: {
  label: string;
  className?: string;
  rows?: number;
}) {
  return (
    <div className={cn('grid gap-3', className)} aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Placeholder tiles for a grid of cards, posters or list entries. */
export function LoadingCards({
  label,
  count = 6,
  className,
  itemClassName,
}: {
  label: string;
  count?: number;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div
      className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn('h-32 w-full rounded-xl', itemClassName)} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Placeholder lines of body copy. */
export function LoadingLines({
  label,
  count = 3,
  className,
}: {
  label: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2.5', className)} aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn('h-4 w-full', i === count - 1 ? 'w-2/3' : undefined)} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
