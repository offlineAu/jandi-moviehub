'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2)
    [totalPages - 1, totalPages - 2, totalPages - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

const itemClass =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-[10px] px-3 text-sm font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-40';

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-1', className)}
    >
      <button
        type="button"
        className={cn(itemClass, 'text-muted hover:bg-white/[0.06] hover:text-foreground')}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <ul className="flex items-center gap-1">
        {pageWindow(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-subtle">
              …
            </li>
          ) : (
            <li
              key={p}
              className={cn(
                Math.abs(p - page) > 1 && p !== 1 && p !== totalPages && 'hidden sm:block',
              )}
            >
              <button
                type="button"
                className={cn(
                  itemClass,
                  p === page
                    ? 'bg-white/[0.1] text-foreground ring-1 ring-primary/50'
                    : 'text-muted hover:bg-white/[0.06] hover:text-foreground',
                )}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <button
        type="button"
        className={cn(itemClass, 'text-muted hover:bg-white/[0.06] hover:text-foreground')}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
