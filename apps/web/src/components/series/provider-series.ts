'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { providerCatalogEpisode } from '@jandi/shared';
import { apiFetch } from '@/lib/api';
import { matchesSeries } from './external-episodes';

export type SeriesProvider = 'moviebox' | 'kisskh' | 'kisskh-direct';
export type SourceEpisode = { number: number; id?: number };
export type SourceSeason = { number: number; name: string; episodes: SourceEpisode[]; id?: number };
type Series = { id: number; title: string };

export function useProviderSeries(provider: SeriesProvider, title: string, enabled = true) {
  const moviebox = useQuery({
    queryKey: ['moviebox-episodes', '71446'],
    queryFn: ({ signal }) =>
      apiFetch<{ seasons: SourceSeason[] }>('/moviebox/episodes', {
        query: { tvId: '71446' },
        signal,
      }),
    enabled: enabled && provider === 'moviebox',
    retry: false,
    staleTime: 120000,
  });
  const search = useQuery({
    queryKey: ['external-series-search', title],
    queryFn: ({ signal }) =>
      apiFetch<{ items: Series[] }>('/external-series/search', { query: { q: title }, signal }),
    enabled: enabled && provider !== 'moviebox',
    retry: false,
    staleTime: 300000,
  });
  const matches = (search.data?.items ?? [])
    .filter((item) => matchesSeries(item.title, title))
    .map((item) => ({
      ...item,
      number: Number(item.title.match(/\b(?:season|part)\s*(\d+)\b/i)?.[1] ?? 1),
    }))
    .sort((a, b) => a.number - b.number)
    .slice(0, 10);
  const details = useQueries({
    queries: matches.map((item) => ({
      queryKey: ['external-series', item.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiFetch<{ series: Series & { episodes: SourceEpisode[] } }>(
          `/external-series/${item.id}`,
          { signal },
        ),
      enabled: enabled && provider !== 'moviebox',
      retry: false,
      staleTime: 300000,
    })),
  });
  if (provider === 'moviebox')
    return {
      seasons: moviebox.data?.seasons ?? [],
      loading: moviebox.isPending,
      error: moviebox.error,
      retry: () => void moviebox.refetch(),
    };
  return {
    seasons: matches.map((item, index) => ({
      number: item.number,
      name: item.title,
      id: item.id,
      episodes:
        details[index]?.data?.series.episodes
          .filter((ep) => ep.number > 0)
          .sort((a, b) => a.number - b.number) ?? [],
    })),
    loading: search.isPending || details.some((result) => result.isPending),
    error: search.error ?? details.find((result) => result.error)?.error ?? null,
    retry: () => {
      void search.refetch();
      details.forEach((result) => void result.refetch());
    },
  };
}

export const sourceArtworkEpisode = providerCatalogEpisode;

export function providerWatchHref(provider: SeriesProvider, part: number, episode: number) {
  return `/watch/tv/71446/season/${part}/episode/${episode}?provider=${provider}&numbering=provider`;
}
