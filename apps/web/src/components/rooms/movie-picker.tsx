'use client';
import { AnimePicker } from '@/components/anime/anime-browser';

import { parseRoomTvTitle, parseExternalTitle, selectionTitle } from '@jandi/shared';
import { SelectedRoomEpisode, TvRoomPicker } from './tv-room-picker';
import { useRoomSourceCapabilities, useRoomSourceCheck } from '@/lib/queries/room-sources';
import { SelectedExternalEpisode } from './vidsrc-tv-picker';
import { Ban, Check, Film, Play } from 'lucide-react';
import * as React from 'react';
import { Artwork } from '@/components/movies/artwork';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useMovie, useMovies } from '@/lib/queries/catalog';
import { apiFetch } from '@/lib/api';
import type { MovieSummary } from '@/lib/types';
import { cn, formatRuntime } from '@/lib/utils';

function MovieRow({
  movie,
  selected,
  onSelect,
}: {
  movie: MovieSummary;
  selected: boolean;
  onSelect: (value?: string) => void;
}) {
  const capabilities = useRoomSourceCapabilities();
  const direct = !!capabilities.data?.kisskhDirectSync;
  const check = useRoomSourceCheck(
    { movieId: movie.id, provider: direct ? 'kisskh-direct' : 'vidsrc' },
    !!capabilities.data?.vidsrcSync && !direct && !movie.playable,
  );
  const listed = !movie.playable && check.data?.listed;
  const disabled =
    !movie.playable && !listed && (!direct || check.isFetching || check.data?.listed === false);
  return (
    <li>
      <button
        type="button"
        onClick={async () => {
          if (movie.playable) return onSelect(movie.id);
          if (direct) {
            const result = await check.refetch();
            if (result.data?.listed)
              onSelect(
                selectionTitle({ provider: 'kisskh-direct', type: 'movie', movieId: movie.id }),
              );
          } else if (listed)
            onSelect(selectionTitle({ provider: 'vidsrc', type: 'movie', movieId: movie.id }));
        }}
        disabled={disabled}
        aria-pressed={selected}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors focus-ring',
          selected ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:bg-glass-2',
          disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
        )}
      >
        <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-md bg-secondary">
          <Artwork src={movie.posterUrl} alt="" sizes="40px" fallbackTitle={movie.title} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{movie.title}</p>
          <p className="text-xs text-muted">
            {[movie.year, formatRuntime(movie.runtimeMin)].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
        {disabled ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
            <Ban className="size-3.5" aria-hidden="true" />
            {capabilities.isLoading
              ? 'Checking providers…'
              : capabilities.isError
                ? 'Provider status unavailable'
                : !direct && !capabilities.data?.vidsrcSync
                  ? 'Movie provider unavailable'
                  : check.isFetching
                    ? 'Checking source…'
                    : check.isError
                      ? 'Source check failed'
                      : 'No source listed'}
          </span>
        ) : selected ? (
          <Check className="size-4 shrink-0 text-primary" aria-label="Selected" />
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-xs text-[#6ee7b7]">
            <Play className="size-3 fill-current" aria-hidden="true" />
            {movie.playable ? 'Playable' : direct ? 'Check KissKH source' : 'VidSrc source listed'}
          </span>
        )}
      </button>
      {(check.isError || (direct && check.data?.listed === false)) && (
        <Button size="sm" variant="ghost" onClick={() => void check.refetch()}>
          Retry source check
        </Button>
      )}
    </li>
  );
}

/** Search the catalog and check provider availability before selecting a movie. */
export function MoviePicker({
  value,
  onChange,
  id,
  invalid,
}: {
  value: string | undefined;
  onChange: (movieId: string | undefined) => void;
  id?: string;
  invalid?: boolean;
}) {
  const [text, setText] = React.useState('');
  const [q, setQ] = React.useState('');
  const [browsing, setBrowsing] = React.useState(!value);
  const capabilities = useRoomSourceCapabilities();
  const warmed = React.useRef(false);
  React.useEffect(() => {
    if (browsing && q.length >= 2 && capabilities.data?.kisskhDirectSync && !warmed.current) {
      warmed.current = true;
      void apiFetch('/room-sources/kisskh/warm', { method: 'POST' }).catch(() => {});
    }
  }, [browsing, q, capabilities.data?.kisskhDirectSync]);
  React.useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim()), 250);
    return () => window.clearTimeout(t);
  }, [text]);
  const selectedTv = value ? parseRoomTvTitle(value) : null;
  const external = value ? parseExternalTitle(value) : null;
  const selected = useMovie(
    selectedTv || external?.type === 'tv' || external?.type === 'anime'
      ? ''
      : external?.type === 'movie'
        ? external.movieId
        : (value ?? ''),
  );
  const results = useMovies(
    q ? { q, pageSize: 8 } : { playable: true, sort: 'popularity', pageSize: 8 },
    { enabled: browsing },
  );

  if (external && !browsing)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-strong p-3">
        {external.type === 'anime' ? <span>Anime episode · synchronized playback</span> : external.type === 'tv' ? (
          <SelectedExternalEpisode media={{ ...external, tmdbId: external.tvId }} />
        ) : (
          <span className="min-w-0 flex-1 basis-48 break-words">
            {selected.data?.title ?? 'Movie'} ·{' '}
            {external.provider === 'kisskh-direct' ? 'KissKH' : 'VidSrc'} synchronized playback
          </span>
        )}
        <div className="ml-auto flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => setBrowsing(true)}>
            Change
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Remove
          </Button>
        </div>
      </div>
    );
  if (value && selectedTv && !browsing)
    return (
      <SelectedRoomEpisode
        value={value}
        onChange={() => setBrowsing(true)}
        onRemove={() => onChange(undefined)}
      />
    );
  if (value && !browsing) {
    const movie = selected.data;
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border-strong bg-secondary p-3"
        id={id}
      >
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md bg-surface">
            {movie ? (
              <Artwork src={movie.posterUrl} alt="" sizes="48px" fallbackTitle={movie.title} />
            ) : (
              <Skeleton className="size-full" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{movie?.title ?? 'Loading…'}</p>
            {movie ? (
              movie.playable ? (
                <p className="text-xs text-[#6ee7b7]">
                  Ready to stream{movie.runtimeMin ? `, ${formatRuntime(movie.runtimeMin)}` : ''}
                </p>
              ) : (
                <p className="text-xs text-danger">Not available to stream — pick another title</p>
              )
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => setBrowsing(true)}>
            Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(undefined)}
            aria-label="Remove movie"
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-secondary/60 p-3',
        invalid ? 'border-danger/60' : 'border-border-strong',
      )}
      id={id}
    >
      {capabilities.data?.anime && <AnimePicker q={q} onSelect={value => { onChange(value); setBrowsing(false); }} />}
      <SearchInput
        value={text}
        onValueChange={setText}
        label="Search movies or series to watch"
        placeholder="Search movies or series"
      />
      <p className="mt-2 px-1 text-xs text-muted">{q ? 'Search results' : 'Ready to stream now'}</p>
      {results.isLoading ? (
        <div className="mt-2 grid gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : results.isError ? (
        <p className="mt-3 px-1 text-sm text-danger">Movies didn’t load. Try searching again.</p>
      ) : results.data?.items.length ? (
        <ul className="mt-1 grid max-h-80 gap-1 overflow-y-auto pr-1">
          {results.data.items.map((m) => (
            <MovieRow
              key={m.id}
              movie={m}
              selected={m.id === value}
              onSelect={(value) => {
                onChange(value ?? m.id);
                setBrowsing(false);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 px-1 text-sm text-muted">
          <Film className="size-4" aria-hidden="true" />
          No titles match “{q}”.
        </p>
      )}
      <TvRoomPicker
        query={q}
        onSelect={(id) => {
          onChange(id);
          setBrowsing(false);
        }}
      />
      {value ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setBrowsing(false)}>
          Keep current title
        </Button>
      ) : null}
    </div>
  );
}
