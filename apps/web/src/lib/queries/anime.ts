'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { PlaybackSource } from '@/lib/types';
export interface AnimeTitle {
  id: string;
  title: string;
  format: string;
  posterUrl: string | null;
}
export interface AnimeEpisode {
  id: string;
  label: string;
  key: string;
  ordinal: number;
  kind: string;
  sources: Array<{
    id: string;
    adapterId: string;
    edition: string;
    audioLanguage: string;
    subtitleLanguage: string | null;
  }>;
}
export interface AnimeEpisodes {
  title: AnimeTitle & { provenance: string };
  episodes: AnimeEpisode[];
}
export function useAnime(q: string, page = 1, enabled = true) {
  return useQuery({
    queryKey: ['anime', q, page],
    queryFn: ({ signal }) =>
      apiFetch<{ items: AnimeTitle[]; hasMore: boolean }>('/anime', { query: { q, page }, signal }),
    enabled,
    retry: false,
    staleTime: 60000,
  });
}
export function useAnimeEpisodes(id: string) {
  return useQuery({
    queryKey: ['anime-episodes', id],
    queryFn: ({ signal }) => apiFetch<AnimeEpisodes>(`/anime/${id}/episodes`, { signal }),
    enabled: !!id,
    retry: false,
    staleTime: 60000,
  });
}
export interface AnimePlayback {
  status: 'pending' | 'ready' | 'missing' | 'unavailable';
  sources: PlaybackSource[];
  movie: { title: string };
}
export function useAnimePlayback(sourceId: string) {
  return useQuery({
    queryKey: ['anime-playback', sourceId],
    queryFn: ({ signal }) => apiFetch<AnimePlayback>(`/anime/sources/${sourceId}`, { signal }),
    enabled: !!sourceId,
    retry: false,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 3000 : false),
  });
}
