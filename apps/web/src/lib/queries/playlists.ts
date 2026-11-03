'use client';

import type { PlaylistVisibility } from '@jandi/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type { ItemList, Paginated, PublicUser } from '../types';

/** Mirrors docs/api/ROOMS.md → Playlists. */
export interface PlaylistMovie {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  runtimeMin: number | null;
  genres: string[];
  isDemo: boolean;
  playable: boolean;
}

export interface PlaylistItem {
  id: string;
  position: number;
  addedBy: PublicUser | null;
  createdAt: string;
  /** Licensed asset duration when playable, otherwise the catalog runtime (or null). */
  durationSec: number | null;
  movie: PlaylistMovie;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  visibility: PlaylistVisibility;
  collaborative: boolean;
  owner: PublicUser;
  collaborators: PublicUser[];
  items: PlaylistItem[];
  itemCount: number;
  playableCount: number;
  totalRuntimeSec: number;
  canEdit: boolean;
  isOwner: boolean;
  sharePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistInput {
  name: string;
  description?: string;
  visibility: PlaylistVisibility;
  collaborative: boolean;
}

export const playlistKeys = {
  all: ['playlists'] as const,
  mine: ['playlists', 'mine'] as const,
  publicAll: ['playlists', 'public'] as const,
  public: (page: number) => ['playlists', 'public', page] as const,
  detail: (id: string) => ['playlists', 'detail', id] as const,
};

const enc = encodeURIComponent;

export function usePlaylists(enabled = true) {
  return useQuery({
    queryKey: playlistKeys.mine,
    queryFn: () => apiFetch<ItemList<Playlist>>('/playlists'),
    enabled,
  });
}

export function usePublicPlaylists(page: number, enabled = true) {
  return useQuery({
    queryKey: playlistKeys.public(page),
    queryFn: () =>
      apiFetch<Paginated<Playlist>>('/playlists/public', { query: { page, pageSize: 12 } }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePlaylist(id: string) {
  return useQuery({
    queryKey: playlistKeys.detail(id),
    queryFn: () =>
      apiFetch<{ playlist: Playlist }>(`/playlists/${enc(id)}`).then((r) => r.playlist),
  });
}

/** Writes a fresh playlist into the detail cache and refreshes the lists. */
function useSyncPlaylist() {
  const qc = useQueryClient();
  return (playlist: Playlist) => {
    qc.setQueryData(playlistKeys.detail(playlist.id), playlist);
    void qc.invalidateQueries({ queryKey: playlistKeys.mine });
    void qc.invalidateQueries({ queryKey: playlistKeys.publicAll });
  };
}

export function useCreatePlaylist() {
  const sync = useSyncPlaylist();
  return useMutation({
    mutationFn: (input: PlaylistInput) =>
      apiFetch<{ playlist: Playlist }>('/playlists', {
        method: 'POST',
        body: input as unknown as Record<string, unknown>,
      }).then((r) => r.playlist),
    onSuccess: sync,
  });
}

export function useUpdatePlaylist(id: string) {
  const sync = useSyncPlaylist();
  return useMutation({
    mutationFn: (input: Partial<PlaylistInput>) =>
      apiFetch<{ playlist: Playlist }>(`/playlists/${enc(id)}`, {
        method: 'PATCH',
        body: input as Record<string, unknown>,
      }).then((r) => r.playlist),
    onSuccess: sync,
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/playlists/${enc(id)}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: playlistKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: playlistKeys.mine });
      void qc.invalidateQueries({ queryKey: playlistKeys.publicAll });
    },
  });
}

export function useAddPlaylistItem() {
  const sync = useSyncPlaylist();
  return useMutation({
    mutationFn: ({ playlistId, movieId }: { playlistId: string; movieId: string }) =>
      apiFetch<{ playlist: Playlist }>(`/playlists/${enc(playlistId)}/items`, {
        method: 'POST',
        body: { movieId },
      }).then((r) => r.playlist),
    onSuccess: sync,
  });
}

/** Recomputes the derived counters after a client-side change to `items`. */
export function withItems(playlist: Playlist, items: PlaylistItem[]): Playlist {
  return {
    ...playlist,
    items: items.map((item, position) => ({ ...item, position })),
    itemCount: items.length,
    playableCount: items.filter((i) => i.movie.playable).length,
    totalRuntimeSec: items.reduce((sum, i) => sum + (i.durationSec ?? 0), 0),
  };
}

export function useRemovePlaylistItem(playlistId: string) {
  const qc = useQueryClient();
  const sync = useSyncPlaylist();
  const key = playlistKeys.detail(playlistId);
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<{ playlist: Playlist }>(`/playlists/${enc(playlistId)}/items/${enc(itemId)}`, {
        method: 'DELETE',
      }).then((r) => r.playlist),
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Playlist>(key);
      if (previous) {
        qc.setQueryData<Playlist>(
          key,
          withItems(
            previous,
            previous.items.filter((i) => i.id !== itemId),
          ),
        );
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: sync,
  });
}

/** PUT the full new order; the list is updated optimistically and rolled back on failure. */
export function useReorderPlaylist(playlistId: string) {
  const qc = useQueryClient();
  const sync = useSyncPlaylist();
  const key = playlistKeys.detail(playlistId);
  return useMutation({
    mutationKey: ['playlists', 'reorder', playlistId],
    mutationFn: (itemIds: string[]) =>
      apiFetch<{ playlist: Playlist }>(`/playlists/${enc(playlistId)}/order`, {
        method: 'PUT',
        body: { itemIds },
      }).then((r) => r.playlist),
    onMutate: async (itemIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Playlist>(key);
      if (previous) {
        const byId = new Map(previous.items.map((i) => [i.id, i]));
        const next = itemIds.map((id) => byId.get(id)).filter((i): i is PlaylistItem => !!i);
        if (next.length === previous.items.length) qc.setQueryData(key, withItems(previous, next));
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (playlist) => {
      // A newer reorder is in flight: its optimistic order wins over this (older) response.
      if (qc.isMutating({ mutationKey: ['playlists', 'reorder', playlistId] }) > 1) return;
      sync(playlist);
    },
  });
}

export function useAddCollaborator(playlistId: string) {
  const sync = useSyncPlaylist();
  return useMutation({
    mutationFn: (username: string) =>
      apiFetch<{ playlist: Playlist }>(`/playlists/${enc(playlistId)}/collaborators`, {
        method: 'POST',
        body: { username },
      }).then((r) => r.playlist),
    onSuccess: sync,
  });
}

export function useRemoveCollaborator(playlistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/playlists/${enc(playlistId)}/collaborators/${enc(userId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: playlistKeys.detail(playlistId) });
      void qc.invalidateQueries({ queryKey: playlistKeys.mine });
    },
  });
}

export function useDuplicatePlaylist() {
  const sync = useSyncPlaylist();
  return useMutation({
    mutationFn: (playlistId: string) =>
      apiFetch<{ playlist: Playlist }>(`/playlists/${enc(playlistId)}/duplicate`, {
        method: 'POST',
      }).then((r) => r.playlist),
    onSuccess: sync,
  });
}
