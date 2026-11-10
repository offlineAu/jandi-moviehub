'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useRoomSourceCapabilities() {
  return useQuery({
    queryKey: ['room-source-capabilities'],
    queryFn: () =>
      apiFetch<{ vidsrcSync: boolean; kisskhDirectSync?: boolean }>('/room-sources/capabilities'),
    staleTime: 60000,
    retry: false,
  });
}
export function useRoomSourceCheck(
  query:
    | { movieId: string; provider?: 'vidsrc' | 'kisskh-direct' }
    | { tvId: number; season: number; episode: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['room-source-check', query],
    queryFn: ({ signal }) =>
      apiFetch<{ listed: boolean; playbackConfirmed: false }>('/room-sources/check', {
        query,
        signal,
      }),
    enabled,
    retry: false,
    staleTime: 60000,
  });
}
