'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { GenreChips } from '@/components/movies/genre-chips';
import { MovieGrid, MovieGridSkeleton } from '@/components/movies/movie-grid';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { TvSearch } from '@/components/series/tv-metadata';
import { SearchCombobox } from './search-combobox';
import { useMovies } from '@/lib/queries/catalog';
import { useRoomSourceCapabilities } from '@/lib/queries/room-sources';
import { useUrlState } from './use-url-state';

export function SearchView() {
  const capabilities = useRoomSourceCapabilities();
  const { params, set } = useUrlState();
  const urlQuery = (params.get('q') ?? '').slice(0, 100);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [text, setText] = React.useState(urlQuery);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep the field in sync with back/forward navigation.
  React.useEffect(() => setText(urlQuery), [urlQuery]);

  // Debounce typing into the URL.
  React.useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === urlQuery.trim()) return;
    const t = window.setTimeout(() => set({ q: trimmed || null }), 300);
    return () => window.clearTimeout(t);
  }, [text, urlQuery, set]);

  React.useEffect(() => {
    if (!urlQuery) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = urlQuery.trim();
  const query = useMovies({ q, page, pageSize: 24 }, { enabled: q.length > 0 });

  return (
    <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Search</h1>
      {capabilities.data?.anime && (
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/anime">Browse anime</Link>
        </Button>
      )}
      <SearchCombobox
        inputRef={inputRef}
        value={text}
        onValueChange={setText}
        onSubmit={(q) => set({ q: q || null })}
        label="Search movies and TV by title"
        placeholder="Search by title"
        maxLength={100}
        size="lg"
        className="mt-6 max-w-2xl"
      />

      <div className="mt-8">
        {!q ? (
          <div className="-mx-4 sm:-mx-6 lg:-mx-10">
            <p className="mb-6 px-4 text-muted sm:px-6 lg:px-10">
              Type a title to search the catalog, or start from a genre.
            </p>
            <GenreChips />
          </div>
        ) : query.isLoading ? (
          <MovieGridSkeleton count={12} />
        ) : query.isError ? (
          <ErrorState
            title="Search didn’t complete"
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={`No movie results for “${q}”`}
            description="Check the spelling, try a shorter title, or browse by genre instead."
            action={
              <Button asChild variant="secondary">
                <Link href="/browse">Browse all movies</Link>
              </Button>
            }
          />
        ) : query.data ? (
          <div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <p className="mb-5 text-sm text-muted" aria-live="polite">
              {query.data.total.toLocaleString()} {query.data.total === 1 ? 'result' : 'results'}{' '}
              for “{q}”
            </p>
            <MovieGrid movies={query.data.items} />
            <Pagination
              className="mt-10"
              page={query.data.page}
              totalPages={query.data.totalPages}
              onPageChange={(p) => {
                set({ page: p === 1 ? null : p }, { resetPage: false });
                window.scrollTo({ top: 0 });
              }}
            />
          </div>
        ) : null}
      </div>
      {q && <TvSearch query={q} />}
    </div>
  );
}
