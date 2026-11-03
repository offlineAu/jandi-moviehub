'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type {
  CatalogInfo,
  Genre,
  ItemList,
  MovieDetail,
  MovieListParams,
  MovieSummary,
  Paginated,
  PlaybackSource,
} from '../types';
import { qk } from './keys';

export function useCatalogInfo() {
  return useQuery({
    queryKey: qk.catalogInfo,
    queryFn: () => apiFetch<CatalogInfo>('/catalog/info'),
    staleTime: 60 * 60_000,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: qk.genres,
    queryFn: () => apiFetch<ItemList<Genre>>('/genres'),
    staleTime: 60 * 60_000,
  });
}

export function useMovies(params: MovieListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.movies(params),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<MovieSummary>>('/movies', {
        signal,
        query: {
          category: params.category,
          genre: params.genre,
          q: params.q,
          year: params.year,
          minRating: params.minRating,
          playable: params.playable ? 'true' : undefined,
          sort: params.sort,
          page: params.page,
          pageSize: params.pageSize,
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    enabled: options.enabled ?? true,
  });
}

export function useMovie(id: string) {
  return useQuery({
    queryKey: qk.movie(id),
    queryFn: ({ signal }) =>
      apiFetch<{ movie: MovieDetail }>(`/movies/${encodeURIComponent(id)}`, { signal }).then(
        (r) => r.movie,
      ),
    staleTime: 10 * 60_000,
    enabled: !!id,
  });
}

export function useSimilar(id: string) {
  return useQuery({
    queryKey: qk.similar(id),
    queryFn: () => apiFetch<ItemList<MovieSummary>>(`/movies/${encodeURIComponent(id)}/similar`),
    staleTime: 10 * 60_000,
  });
}

export function useRecommendations(id: string) {
  return useQuery({
    queryKey: qk.recommendations(id),
    queryFn: () =>
      apiFetch<ItemList<MovieSummary>>(`/movies/${encodeURIComponent(id)}/recommendations`),
    staleTime: 10 * 60_000,
  });
}

export function usePlayback(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.playback(id),
    queryFn: () =>
      apiFetch<{ sources: PlaybackSource[] }>(`/movies/${encodeURIComponent(id)}/playback`),
    enabled,
    // Signed URLs expire; never serve them from a long-lived cache.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
