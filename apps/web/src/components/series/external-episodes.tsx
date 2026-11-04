'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, ShieldAlert } from 'lucide-react';
import { NativeSelect } from '@/components/ui/native-select';
import { ErrorState } from '@/components/ui/error-state';
import { apiFetch, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

type Series = { id: number; title: string };
type Episode = { id: number; number: number };

// Match only the exact series title, optionally followed by a season/part label.
export function matchesSeries(candidate: string, title: string) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const expected = normalize(title);
  const actual = normalize(candidate);
  if (!expected) return false;
  return (
    actual === expected ||
    new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (season|part) [0-9]+$`).test(
      actual,
    )
  );
}

export function ExternalEpisodes({
  title,
  season,
  episode,
  requireSourceSelection = false,
  onPlayerChange,
  onStatusChange,
}: {
  title: string;
  season: number;
  episode: number;
  requireSourceSelection?: boolean;
  onPlayerChange: (source: { id: number; title: string } | null) => void;
  onStatusChange: (status: string) => void;
}) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = React.useState<number | null>(
    requireSourceSelection ? null : episode,
  );
  React.useEffect(() => {
    setSelectedId(null);
    setSelectedEpisode(requireSourceSelection ? null : episode);
  }, [title, season, episode, requireSourceSelection]);
  const search = useQuery({
    queryKey: ['external-series-search', title],
    queryFn: () =>
      apiFetch<{ items: Series[] }>('/external-series/search', { query: { q: title } }),
    enabled: title.trim().length >= 2,
    retry: false,
    staleTime: 300000,
  });
  const matches = (search.data?.items ?? [])
    .filter((item) => matchesSeries(item.title, title))
    .sort((a, b) => {
      const number = (name: string) => Number(name.match(/\b(?:season|part)\s*(\d+)/i)?.[1] ?? 0);
      return number(a.title) - number(b.title) || a.title.localeCompare(b.title);
    });
  const suggested = matches.find((item) =>
    new RegExp(`\\b(?:season|part)\\s*${season}\\b`, 'i').test(item.title),
  );
  const current = matches.find((item) => item.id === selectedId) ?? suggested ?? matches[0];
  const detail = useQuery({
    queryKey: ['external-series', current?.id],
    queryFn: () =>
      apiFetch<{ series: Series & { episodes: Episode[] } }>(`/external-series/${current!.id}`),
    enabled: !!current,
    retry: false,
    staleTime: 300000,
  });
  const candidate = detail.data?.series.episodes.find((item) => item.number === selectedEpisode);
  const candidateId = candidate?.id;
  const candidateTitle =
    candidate && current ? `${current.title} episode ${candidate.number}` : null;
  React.useEffect(() => {
    onPlayerChange(
      candidateId && candidateTitle ? { id: candidateId, title: candidateTitle } : null,
    );
  }, [candidateId, candidateTitle, onPlayerChange]);
  const status =
    search.isLoading || (current && detail.isLoading)
      ? 'Finding an episode source…'
      : search.isError || detail.isError
        ? errorMessage(search.error ?? detail.error, 'Could not check the episode source.')
        : requireSourceSelection && selectedEpisode === null
          ? 'Season 1 uses a different cut. Choose a source part and episode above.'
          : !current || !candidate
            ? 'No matching episode source was found.'
            : 'Loading the episode player…';
  React.useEffect(() => onStatusChange(status), [status, onStatusChange]);
  const note = (text: string) => (
    <p className="mt-6 flex items-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
      <Info className="size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
  if (search.isLoading) return note('Checking external sources…');
  if (search.isError)
    return (
      <ErrorState
        compact
        title="Could not check the episode source"
        error={search.error}
        retrying={search.isFetching}
        onRetry={() => void search.refetch()}
      />
    );
  if (!current) return note('No matching external series found.');
  return (
    <section
      className="mt-8 rounded-3xl bg-white/[0.025] p-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] sm:p-6"
      aria-labelledby="source-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 id="source-title" className="font-display text-lg font-semibold">
            Playback source
          </h2>
          <p className="mt-1 text-sm text-muted">
            Pick the episode by this source’s numbering — cuts can differ between providers.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="source-season">
            Source season or part
          </label>
          <NativeSelect
            id="source-season"
            value={current.id}
            onChange={(event) => {
              setSelectedId(Number(event.target.value));
              setSelectedEpisode(requireSourceSelection ? null : 1);
              onPlayerChange(null);
            }}
          >
            {matches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {detail.isLoading ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="shimmer h-12 rounded-xl" />
          ))}
        </div>
      ) : null}
      {detail.isError ? (
        <ErrorState
          compact
          title="Source episodes could not be loaded"
          error={detail.error}
          retrying={detail.isFetching}
          onRetry={() => void detail.refetch()}
        />
      ) : null}
      {detail.data && !candidate && selectedEpisode !== null ? (
        <p className="mt-4 text-sm text-muted">
          This source does not list episode {selectedEpisode} in this part.
        </p>
      ) : null}
      {detail.data ? (
        <div
          className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2"
          role="group"
          aria-label="Source episodes"
        >
          {detail.data.series.episodes.map((item) => {
            const on = item.number === selectedEpisode;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                aria-label={`Episode ${item.number}`}
                title={`Episode ${item.number}`}
                onClick={() => setSelectedEpisode(item.number)}
                className={cn(
                  'relative isolate grid h-12 place-items-center overflow-hidden rounded-xl text-sm font-semibold tabular-nums transition-[background,color,box-shadow,transform] duration-300 ease-[var(--ease-expo)] active:scale-95 focus-ring',
                  on
                    ? 'bg-[linear-gradient(135deg,#7c3aed,#c026d3_55%,#db2777)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_10px_24px_-10px_rgb(219_39_119/0.75)]'
                    : 'bg-white/[0.04] text-foreground/80 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] hover:-translate-y-0.5 hover:bg-white/[0.08] hover:text-white hover:shadow-[inset_0_0_0_1px_rgb(168_85_247/0.45)]',
                )}
              >
                {item.number}
              </button>
            );
          })}
        </div>
      ) : null}

      {candidate ? (
        <p className="mt-4 text-sm text-foreground/80">
          Playing <span className="font-semibold text-white">{current.title}</span>, episode{' '}
          {candidate.number}.
        </p>
      ) : null}
      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
        <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
        The player is third-party and may show ads or track visits. A browser with content blocking
        (such as Brave with Shields on) reduces both; blocking may affect playback.
      </p>
    </section>
  );
}
