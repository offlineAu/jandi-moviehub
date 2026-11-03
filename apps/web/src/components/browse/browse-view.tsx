'use client';

import { SplitWords } from '@/components/motion/split-text';
import { movieListQuerySchema } from '@jandi/shared';
import { Clapperboard, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { MovieGrid, MovieGridSkeleton } from '@/components/movies/movie-grid';
import { TvGenreBrowse } from '@/components/series/tv-genres';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useGenres, useMovies } from '@/lib/queries/catalog';
import type { MovieListParams } from '@/lib/types';
import { useUrlState } from './use-url-state';

const SORTS = [
  { value: 'popularity', label: 'Most popular' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'release', label: 'Newest first' },
  { value: 'title', label: 'Title A–Z' },
] as const;

const RATINGS = [
  { value: 'any', label: 'Any rating' },
  { value: '5', label: '5+' },
  { value: '6', label: '6+' },
  { value: '7', label: '7+' },
  { value: '8', label: '8+' },
];

function parseParams(params: URLSearchParams): MovieListParams {
  const raw = Object.fromEntries(params.entries());
  const parsed = movieListQuerySchema.safeParse(raw);
  if (parsed.success) {
    const { page, genre, year, minRating, playable, sort } = parsed.data;
    return { page, genre, year, minRating, playable, sort };
  }
  // Ignore malformed values individually.
  const out: MovieListParams = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = movieListQuerySchema.safeParse({ [key]: value });
    if (single.success)
      Object.assign(out, { [key]: (single.data as Record<string, unknown>)[key] });
  }
  return out;
}

function Filters({
  value,
  onChange,
  idPrefix,
}: {
  value: MovieListParams;
  onChange: (u: Record<string, string | number | boolean | null>) => void;
  idPrefix: string;
}) {
  const genres = useGenres();
  const [year, setYear] = React.useState(value.year ? String(value.year) : '');
  React.useEffect(() => setYear(value.year ? String(value.year) : ''), [value.year]);

  const commitYear = () => {
    const n = Number(year);
    if (!year) onChange({ year: null });
    else if (Number.isInteger(n) && n >= 1870 && n <= 2100) onChange({ year: n });
  };
  const yearInvalid =
    !!year && !(Number.isInteger(Number(year)) && Number(year) >= 1870 && Number(year) <= 2100);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
      <div className="grid gap-2 lg:w-48">
        <Label htmlFor={`${idPrefix}-genre`}>Genre</Label>
        <Select
          value={value.genre ?? 'all'}
          onValueChange={(v) => onChange({ genre: v === 'all' ? null : v })}
        >
          <SelectTrigger id={`${idPrefix}-genre`} aria-label="Genre">
            <SelectValue placeholder="All genres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All genres</SelectItem>
            {genres.data?.items.map((g) => (
              <SelectItem key={g.id} value={g.slug}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 lg:w-32">
        <Label htmlFor={`${idPrefix}-year`}>Year</Label>
        <Input
          id={`${idPrefix}-year`}
          inputMode="numeric"
          placeholder="Any year"
          value={year}
          maxLength={4}
          aria-invalid={yearInvalid || undefined}
          aria-describedby={yearInvalid ? `${idPrefix}-year-error` : undefined}
          onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commitYear}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitYear();
          }}
        />
        {yearInvalid ? (
          <p id={`${idPrefix}-year-error`} className="text-xs text-danger">
            Enter a year between 1870 and 2100
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 lg:w-36">
        <Label htmlFor={`${idPrefix}-rating`}>Minimum rating</Label>
        <Select
          value={value.minRating ? String(value.minRating) : 'any'}
          onValueChange={(v) => onChange({ minRating: v === 'any' ? null : Number(v) })}
        >
          <SelectTrigger id={`${idPrefix}-rating`} aria-label="Minimum rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RATINGS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 lg:w-44">
        <Label htmlFor={`${idPrefix}-sort`}>Sort by</Label>
        <Select
          value={value.sort ?? 'popularity'}
          onValueChange={(v) => onChange({ sort: v === 'popularity' ? null : v })}
        >
          <SelectTrigger id={`${idPrefix}-sort`} aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex h-11 items-center gap-3 sm:col-span-2 lg:col-span-1">
        <Switch
          id={`${idPrefix}-playable`}
          checked={!!value.playable}
          onCheckedChange={(v) => onChange({ playable: v ? 'true' : null })}
        />
        <Label htmlFor={`${idPrefix}-playable`}>Playable only</Label>
      </div>
    </div>
  );
}

export function BrowseView() {
  const { params, set } = useUrlState();
  const filters = parseParams(params);
  const page = filters.page ?? 1;
  const query = useMovies({ ...filters, page, pageSize: 24 });
  const genres = useGenres();
  const activeCount = [filters.genre, filters.year, filters.minRating, filters.playable].filter(
    Boolean,
  ).length;
  const genreName = genres.data?.items.find((g) => g.slug === filters.genre)?.name;

  const onChange = (updates: Record<string, string | number | boolean | null>) => set(updates);
  const clear = () => set({ genre: null, year: null, minRating: null, playable: null, sort: null });

  return (
    <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-[-0.035em] sm:text-5xl">
            <SplitWords text={genreName ?? 'Browse'} />
          </h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {query.data
              ? `${query.data.total.toLocaleString()} ${query.data.total === 1 ? 'title' : 'titles'}`
              : ' '}
          </p>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <SlidersHorizontal aria-hidden="true" />
                Filters{activeCount ? ` (${activeCount})` : ''}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="overflow-y-auto">
              <SheetTitle className="font-display text-lg font-semibold">Filters</SheetTitle>
              <SheetDescription className="sr-only">
                Narrow the catalog by genre, year, rating and availability.
              </SheetDescription>
              <Filters value={filters} onChange={onChange} idPrefix="sheet" />
              {activeCount ? (
                <Button variant="ghost" onClick={clear}>
                  Clear filters
                </Button>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="mb-6">
        <Button asChild variant="secondary">
          <Link href="/series">Browse series &amp; dramas</Link>
        </Button>
      </div>

      <div className="mb-8 hidden rounded-2xl border border-border bg-secondary/60 p-4 lg:block">
        <div className="flex items-end justify-between gap-4">
          <Filters value={filters} onChange={onChange} idPrefix="bar" />
          {activeCount ? (
            <Button variant="ghost" size="sm" onClick={clear} className="mb-1.5">
              <X aria-hidden="true" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {query.isLoading ? (
        <MovieGridSkeleton count={18} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title="Titles didn’t load"
        />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No titles match these filters"
          description="Try a different genre or year, lower the minimum rating, or include titles that aren’t streamable."
          action={
            activeCount ? (
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : query.data ? (
        <div
          className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
          aria-busy={query.isPlaceholderData || undefined}
        >
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
      {filters.genre && !filters.year && !filters.minRating && !filters.playable && (
        <TvGenreBrowse initialGenre={filters.genre} />
      )}
    </div>
  );
}
