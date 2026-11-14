'use client';

import { Check, Film, Play, Plus, SearchX } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Artwork } from '@/components/movies/artwork';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useMovies } from '@/lib/queries/catalog';
import { useAddPlaylistItem, type Playlist } from '@/lib/queries/playlists';
import type { MovieSummary } from '@/lib/types';
import { formatRuntime } from '@/lib/utils';

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ResultRow({
  movie,
  count,
  pending,
  onAdd,
}: {
  movie: MovieSummary;
  count: number;
  pending: boolean;
  onAdd: () => void;
}) {
  const runtime = formatRuntime(movie.runtimeMin);
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-glass-1">
      <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-md bg-surface-raised ring-1 ring-white/10">
        <Artwork src={movie.posterUrl} alt="" sizes="40px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{movie.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {movie.year ? <span>{movie.year}</span> : null}
          {runtime ? <span>{runtime}</span> : null}
          {movie.playable ? (
            <span className="inline-flex items-center gap-1 text-[#6ee7b7]">
              <Play className="size-3 fill-current" aria-hidden="true" />
              Playable
            </span>
          ) : (
            <span>Not available to stream</span>
          )}
          {count > 0 ? (
            <Badge variant="primary" className="py-0">
              <Check aria-hidden="true" />
              In playlist{count > 1 ? ` ×${count}` : ''}
            </Badge>
          ) : null}
        </p>
      </div>
      <Button
        size="sm"
        variant={count > 0 ? 'ghost' : 'secondary'}
        onClick={onAdd}
        loading={pending}
        loadingText="Adding"
        aria-label={`${count > 0 ? 'Add another copy of' : 'Add'} ${movie.title}`}
      >
        <Plus aria-hidden="true" />
        {count > 0 ? 'Again' : 'Add'}
      </Button>
    </li>
  );
}

function SearchResults({ playlist, onlyPlayable }: { playlist: Playlist; onlyPlayable: boolean }) {
  const [text, setText] = React.useState('');
  const q = useDebounced(text.trim(), 300);
  const query = useMovies(
    {
      q: q || undefined,
      playable: onlyPlayable || undefined,
      sort: q ? undefined : 'popularity',
      pageSize: 12,
    },
    {},
  );
  const add = useAddPlaylistItem();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of playlist.items) map.set(item.movie.id, (map.get(item.movie.id) ?? 0) + 1);
    return map;
  }, [playlist.items]);

  const onAdd = (movie: MovieSummary) => {
    setPendingId(movie.id);
    add.mutate(
      { playlistId: playlist.id, movieId: movie.id },
      {
        onSuccess: () => toast.success(`Added “${movie.title}”`),
        onError: (error) => toast.error(errorMessage(error, 'Couldn’t add the movie. Try again.')),
        onSettled: () => setPendingId(null),
      },
    );
  };

  let body: React.ReactNode;
  if (query.isLoading) {
    body = (
      <div className="grid gap-2" aria-busy="true" aria-label="Searching">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="aspect-[2/3] w-10 rounded-md" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <ErrorState
        compact
        title="Search didn’t load"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  } else if (!query.data?.items.length) {
    body = (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
        <SearchX className="size-6" aria-hidden="true" />
        {q ? `No movies match “${q}”.` : 'No movies to suggest.'}
      </div>
    );
  } else {
    body = (
      <ul className="grid gap-0.5" aria-busy={query.isFetching || undefined}>
        {query.data.items.map((movie) => (
          <ResultRow
            key={movie.id}
            movie={movie}
            count={counts.get(movie.id) ?? 0}
            pending={pendingId === movie.id}
            onAdd={() => onAdd(movie)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="grid min-h-0 gap-3">
      <SearchInput
        value={text}
        onValueChange={setText}
        label="Search movies to add"
        placeholder="Search by title"
        maxLength={100}
        autoFocus
      />
      <p className="text-xs text-muted" aria-live="polite">
        {query.isLoading
          ? 'Searching…'
          : q
            ? `${query.data?.total ?? 0} results for “${q}”`
            : 'Popular picks — or search by title.'}
      </p>
      <div className="-mx-2 max-h-[min(26rem,55dvh)] overflow-y-auto overscroll-contain">
        {body}
      </div>
    </div>
  );
}

export function AddMovieDialog({
  playlist,
  open,
  onOpenChange,
}: {
  playlist: Playlist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [onlyPlayable, setOnlyPlayable] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="size-5 text-primary" aria-hidden="true" />
            Add movies
          </DialogTitle>
          <DialogDescription>
            New movies go to the end of “{playlist.name}”. Titles that aren’t available to stream
            are skipped in a marathon.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2.5 text-sm">
          <Checkbox
            checked={onlyPlayable}
            onCheckedChange={(v) => setOnlyPlayable(v === true)}
            aria-label="Only show titles available to stream"
          />
          <span>Only titles available to stream</span>
        </div>
        {open ? <SearchResults playlist={playlist} onlyPlayable={onlyPlayable} /> : null}
      </DialogContent>
    </Dialog>
  );
}
