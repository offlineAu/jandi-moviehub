'use client';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { ErrorState } from '@/components/ui/error-state';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

type Film = {
  id: string;
  title: string;
  durationSec: number;
  embedUrl: string;
  sourceUrl: string;
  licenseUrl: string;
  attribution: string;
  provider: string;
  creator: string;
};
export function ExternalFilmSearch({ query }: { query: string }) {
  const result = useQuery({
    queryKey: ['external-films'],
    queryFn: () => apiFetch<{ items: Film[]; unavailable: number }>('/external-films'),
    enabled: query.trim().length >= 2,
    retry: false,
    staleTime: 60000,
  });
  const items =
    result.data?.items.filter((item) =>
      item.title.toLowerCase().includes(query.trim().toLowerCase()),
    ) ?? [];
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">Watch from creators and archives</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((film) => (
          <li key={film.id}>
            <Link
              className="block rounded-xl border border-border bg-surface p-4 hover:border-primary"
              href={`/open-films#film-${film.id}`}
            >
              {film.title}
              <span className="block text-sm text-muted">{film.provider}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
export function ExternalFilmsView() {
  const [selected, setSelected] = React.useState<string | null>(null);
  const result = useQuery({
    queryKey: ['external-films'],
    queryFn: () => apiFetch<{ items: Film[]; unavailable: number }>('/external-films'),
    retry: false,
    staleTime: 60000,
  });
  React.useEffect(() => {
    const hash = window.location.hash;
    if (result.data && /^#film-[a-zA-Z0-9_-]{1,128}$/.test(hash)) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }, [result.data]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Watch free movies</h1>
      <p className="mt-2 text-muted">
        These films play from their approved external hosts. No upload is needed.
      </p>
      {result.isLoading ? (
        <p className="mt-6 text-muted">Loading films…</p>
      ) : result.isError ? (
        <div className="mt-6">
          <ErrorState error={result.error} onRetry={() => void result.refetch()} />
        </div>
      ) : (
        <div className="mt-6 grid gap-6">
          {!!result.data?.unavailable && (
            <p className="text-sm text-muted">
              Some films are currently unavailable from the host.
            </p>
          )}
          {result.data?.items.map((film) => (
            <article
              id={`film-${film.id}`}
              key={film.id}
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <h2 className="font-display text-xl font-semibold">{film.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {film.durationSec > 0 && `${Math.floor(film.durationSec / 60)} min · `}
                {film.creator}
              </p>
              <p className="mt-2 text-sm text-muted">
                {film.attribution}{' '}
                <a href={film.licenseUrl} target="_blank" rel="noreferrer" className="link-fx">
                  License and credits
                </a>
              </p>
              {selected === film.id ? (
                <div className="mt-4 aspect-video overflow-hidden rounded-xl bg-black">
                  <iframe
                    className="size-full"
                    title={film.title}
                    src={film.embedUrl}
                    allow="fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-4 rounded-lg bg-primary px-4 py-2 font-semibold text-white"
                  onClick={() => setSelected(film.id)}
                >
                  Watch film
                </button>
              )}
              <p className="mt-3 text-xs text-muted">
                Hosted by{' '}
                <a href={film.sourceUrl} target="_blank" rel="noreferrer" className="link-fx">
                  {film.provider}
                </a>
                . Playback and availability depend on the host.
              </p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
