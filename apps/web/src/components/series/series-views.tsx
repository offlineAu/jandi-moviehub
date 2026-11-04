'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Clapperboard, Film, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { BackLink } from '@/components/ui/back-link';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { apiFetch, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';
import { useGenres } from '@/lib/queries/catalog';
import { TvSearch } from './tv-metadata';
import { TvGenreBrowse } from './tv-genres';

type Series = {
  id: string;
  title: string;
  description: string;
  country: string;
  episodeCount: number;
};
type Episode = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  movie: { id: string; title: string; runtimeMin: number | null; playable: boolean };
};

export function SeriesBrowse() {
  const [q, setQ] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [language, setLanguage] = React.useState('');
  const [genre, setGenre] = React.useState('');
  const [year, setYear] = React.useState('');
  const genres = useGenres();
  const filterYear =
    /^\d{4}$/.test(year) && Number(year) >= 1870 && Number(year) <= 2100 ? year : '';
  const filterLanguage = language.trim().length >= 2 ? language.trim() : '';
  const [page, setPage] = React.useState(1);
  const result = useQuery({
    queryKey: ['series', q, country, filterLanguage, genre, filterYear, page],
    queryFn: () =>
      apiFetch<{ items: Series[]; page: number; totalPages: number }>('/series', {
        query: { q, country, language: filterLanguage, genre, year: filterYear, page },
      }),
  });
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
        Find your next story
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Series &amp; dramas</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Explore series, choose an episode, and watch together.
      </p>
      <div className="relative mt-7 max-w-lg">
        <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted" />
        <Input
          aria-label="Search series"
          placeholder="Search series"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="pl-10"
        />
      </div>
      <div className="mt-4 max-w-lg">
        <Input
          aria-label="Filter series by country"
          placeholder="Filter by country, e.g. Korea"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-3">
        <Input
          aria-label="Filter by language code"
          placeholder="Language code, e.g. ko"
          maxLength={10}
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Filter by genre"
          value={genre}
          onChange={(e) => {
            setGenre(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">All genres</option>
          {genres.data?.items.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Filter by episode release year"
          placeholder="Episode year, e.g. 2020"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={(e) => {
            setYear(e.target.value.replace(/\D/g, ''));
            setPage(1);
          }}
          aria-invalid={!!year && !filterYear}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Language, genre and year match the metadata of an episode in the series.
      </p>
      <div className="mt-8" aria-live="polite">
        {result.isLoading ? (
          <p className="text-muted">Loading series…</p>
        ) : result.isError ? (
          <ErrorState error={result.error} onRetry={() => void result.refetch()} />
        ) : !result.data?.items.length ? (
          <EmptyState
            icon={Clapperboard}
            title={
              q || country || filterLanguage || genre || filterYear
                ? 'No series found'
                : 'No series available yet'
            }
            description={
              q || country || filterLanguage || genre || filterYear
                ? 'Try a different search or country.'
                : 'Series will appear here when they are added.'
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/series/${item.id}`}
                  className="group rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/50 focus-ring"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                    <Film className="size-5" aria-hidden="true" />
                  </span>
                  <h2 className="mt-4 font-display text-xl font-semibold group-hover:text-primary">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {[
                      item.country,
                      `${item.episodeCount} ${item.episodeCount === 1 ? 'episode' : 'episodes'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {item.description && (
                    <p className="mt-3 line-clamp-3 text-sm text-muted">{item.description}</p>
                  )}
                </Link>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted">
                Page {page} of {result.data.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= result.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
      <TvSearch query={q} showPopular />
      {!q && <TvGenreBrowse />}
    </div>
  );
}

export function SeriesDetail({ id }: { id: string }) {
  const router = useRouter();
  const me = useMe();
  const signedIn = !!me.data && !me.data.isGuest;
  const createPlaylist = useMutation({
    mutationFn: (target: 'room' | 'playlist') =>
      apiFetch<{ playlist: { id: string } }>(`/playlists/from-series/${encodeURIComponent(id)}`, {
        method: 'POST',
      }).then(({ playlist }) => ({ playlist, target })),
    // "Watch together" goes straight to room setup with the series queued as a marathon.
    onSuccess: ({ playlist, target }) =>
      router.push(
        target === 'room'
          ? `/rooms/new?playlistId=${encodeURIComponent(playlist.id)}`
          : `/playlists/${playlist.id}`,
      ),
    onError: (error) => toast.error(errorMessage(error, 'Couldn’t create the playlist.')),
  });
  const watchTogether = () => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/series/${id}`)}`);
      return;
    }
    createPlaylist.mutate('room');
  };
  const result = useQuery({
    queryKey: ['series-detail', id],
    queryFn: () =>
      apiFetch<{ series: Series & { episodes: Episode[] } }>(`/series/${encodeURIComponent(id)}`),
  });
  if (result.isLoading) return <div className="p-8 text-muted">Loading series…</div>;
  if (result.isError || !result.data)
    return (
      <div className="p-8">
        <ErrorState error={result.error} onRetry={() => void result.refetch()} />
      </div>
    );
  const s = result.data.series;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <BackLink href="/series">All series</BackLink>
      <h1 className="mt-5 font-display text-3xl font-bold sm:text-4xl">{s.title}</h1>
      {s.country && <p className="mt-2 text-sm text-muted">{s.country}</p>}
      {s.description && <p className="mt-4 max-w-3xl text-muted">{s.description}</p>}
      {s.episodes.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={watchTogether}
              loading={createPlaylist.isPending && createPlaylist.variables === 'room'}
              disabled={createPlaylist.isPending}
            >
              <Users aria-hidden="true" />
              Watch series together
            </Button>
            {signedIn ? (
              <Button
                variant="secondary"
                onClick={() => createPlaylist.mutate('playlist')}
                loading={createPlaylist.isPending && createPlaylist.variables === 'playlist'}
                disabled={createPlaylist.isPending}
              >
                Save as playlist
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted">
            Opens a watch party that plays every episode in order for everyone, with a countdown
            between episodes. Unavailable episodes are skipped.
          </p>
        </div>
      )}
      <h2 className="mt-10 font-display text-2xl font-semibold">Episodes</h2>
      {s.episodes.length === 0 ? (
        <p className="mt-4 text-muted">No episodes have been added yet.</p>
      ) : (
        <ol className="mt-4 grid gap-3">
          {s.episodes.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/[0.03] p-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] transition-colors hover:bg-white/[0.05]"
            >
              <div>
                <p className="text-xs font-medium text-[#f0abfc]">
                  Season {e.seasonNumber} · Episode {e.episodeNumber}
                </p>
                <p className="mt-1 font-semibold">{e.movie.title}</p>
                {e.movie.runtimeMin && (
                  <p className="mt-1 text-sm text-muted">{e.movie.runtimeMin} min</p>
                )}
              </div>
              {e.movie.playable ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary">
                    <Link
                      href={`/rooms/new?movieId=${encodeURIComponent(e.movie.id)}`}
                      aria-label={`Watch season ${e.seasonNumber} episode ${e.episodeNumber} together`}
                    >
                      <Users aria-hidden="true" />
                      Watch together
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href={`/watch/${e.movie.id}`}>Watch episode</Link>
                  </Button>
                </div>
              ) : (
                <span className="text-sm text-muted">Not available to watch</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
