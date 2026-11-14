'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import * as React from 'react';
import { apiFetch, isApiError } from '@/lib/api';
import { LoadingCards, LoadingLines } from '@/components/ui/loading';

type Item = { id: number; title: string; firstAirDate: string | null };
export function TvGenreBrowse({ initialGenre }: { initialGenre?: string }) {
  const [chosen, setChosen] = React.useState(initialGenre ?? '');
  React.useEffect(() => setChosen(initialGenre ?? ''), [initialGenre]);
  const genres = useQuery({
    queryKey: ['tv-genres'],
    queryFn: () => apiFetch<{ items: { id: number; name: string; slug: string }[] }>('/tv/genres'),
    retry: false,
  });
  const results = useQuery({
    queryKey: ['tv-genre', chosen],
    queryFn: () => apiFetch<{ items: Item[] }>('/tv/discover', { query: { genre: chosen } }),
    enabled: !!chosen,
    retry: false,
  });
  if (
    genres.isError &&
    isApiError(genres.error) &&
    genres.error.code === 'TV_METADATA_NOT_CONFIGURED'
  )
    return null;
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">TV by genre</h2>
      <p className="mt-2 text-sm text-muted">
        TV genre filters are separate from movie filters and playback availability.
      </p>
      {genres.isLoading ? (
        <div className="mt-3">
          <LoadingLines label="Loading TV genres" count={1} />
        </div>
      ) : genres.isError ? (
        <p className="mt-3 text-muted">TV genres could not be loaded.</p>
      ) : (
        <>
          <label className="sr-only" htmlFor="tv-genre-picker">
            TV genre
          </label>
          <select
            id="tv-genre-picker"
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
            className="mt-3 rounded-lg border border-border bg-background p-3"
          >
            <option value="">Choose a TV genre</option>
            {genres.data?.items.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          {chosen &&
            (results.isLoading ? (
              <div className="mt-4">
                <LoadingCards label="Loading TV series" count={6} itemClassName="h-24" />
              </div>
            ) : results.isError ? (
              <p className="mt-3 text-muted">TV series could not be loaded.</p>
            ) : !results.data?.items.length ? (
              <p className="mt-3 text-muted">No TV series found for this genre.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.data.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/tv/${item.id}`}
                      className="block rounded-xl border border-border bg-surface p-4 hover:border-primary"
                    >
                      {item.title}
                      <span className="block text-sm text-muted">
                        TV series{item.firstAirDate ? ` · ${item.firstAirDate.slice(0, 4)}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}
    </section>
  );
}
