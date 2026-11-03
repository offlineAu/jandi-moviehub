'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type {
  FavoriteEntry,
  HistoryEntry,
  ItemList,
  LibraryStatus,
  Paginated,
  Watchlist,
  WatchlistDetail,
} from '../types';
import { qk } from './keys';

const id = encodeURIComponent;

export function useLibraryStatus(movieId: string, enabled = true) {
  return useQuery({
    queryKey: qk.libraryStatus(movieId),
    queryFn: () => apiFetch<LibraryStatus>(`/movies/${id(movieId)}/library-status`),
    enabled,
  });
}

// ---------- Favorites ----------
export function useFavorites(page: number, enabled = true) {
  return useQuery({
    queryKey: qk.favorites(page),
    queryFn: () =>
      apiFetch<Paginated<FavoriteEntry>>('/favorites', { query: { page, pageSize: 24 } }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Toggle favorite with an optimistic update of the movie's library status. */
export function useToggleFavorite(movieId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: boolean) =>
      apiFetch<void>(`/favorites/${id(movieId)}`, { method: next ? 'PUT' : 'DELETE' }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: qk.libraryStatus(movieId) });
      const previous = qc.getQueryData<LibraryStatus>(qk.libraryStatus(movieId));
      if (previous)
        qc.setQueryData<LibraryStatus>(qk.libraryStatus(movieId), { ...previous, favorite: next });
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) qc.setQueryData(qk.libraryStatus(movieId), context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.libraryStatus(movieId) });
      void qc.invalidateQueries({ queryKey: qk.favoritesAll });
    },
  });
}

/** Remove a favorite from the favorites grid (optimistic removal from the current page). */
export function useRemoveFavorite(page: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (movieId: string) =>
      apiFetch<void>(`/favorites/${id(movieId)}`, { method: 'DELETE' }),
    onMutate: async (movieId) => {
      await qc.cancelQueries({ queryKey: qk.favorites(page) });
      const previous = qc.getQueryData<Paginated<FavoriteEntry>>(qk.favorites(page));
      if (previous) {
        qc.setQueryData<Paginated<FavoriteEntry>>(qk.favorites(page), {
          ...previous,
          items: previous.items.filter((entry) => entry.movie.id !== movieId),
          total: Math.max(0, previous.total - 1),
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(qk.favorites(page), context.previous);
    },
    onSettled: (_d, _e, movieId) => {
      void qc.invalidateQueries({ queryKey: qk.favoritesAll });
      void qc.invalidateQueries({ queryKey: qk.libraryStatus(movieId) });
    },
  });
}

// ---------- Watchlists ----------
export function useWatchlists(enabled = true) {
  return useQuery({
    queryKey: qk.watchlists,
    queryFn: () => apiFetch<ItemList<Watchlist>>('/watchlists'),
    enabled,
  });
}

export function useWatchlist(watchlistId: string) {
  return useQuery({
    queryKey: qk.watchlist(watchlistId),
    queryFn: () => apiFetch<WatchlistDetail>(`/watchlists/${id(watchlistId)}`),
  });
}

export function useCreateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      apiFetch<{ watchlist: Watchlist }>('/watchlists', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.watchlists }),
  });
}

export function useUpdateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      watchlistId,
      ...input
    }: {
      watchlistId: string;
      name?: string;
      description?: string;
    }) =>
      apiFetch<{ watchlist: Watchlist }>(`/watchlists/${id(watchlistId)}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: qk.watchlists });
      void qc.invalidateQueries({ queryKey: qk.watchlist(vars.watchlistId) });
    },
  });
}

export function useDeleteWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (watchlistId: string) =>
      apiFetch<void>(`/watchlists/${id(watchlistId)}`, { method: 'DELETE' }),
    onSuccess: (_d, watchlistId) => {
      qc.removeQueries({ queryKey: qk.watchlist(watchlistId) });
      void qc.invalidateQueries({ queryKey: qk.watchlists });
      void qc.invalidateQueries({ queryKey: ['library', 'status'] });
    },
  });
}

/** Add/remove a movie to/from a watchlist with an optimistic library-status update. */
export function useToggleWatchlistItem(movieId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ watchlistId, add }: { watchlistId: string; add: boolean }) =>
      add
        ? apiFetch<void>(`/watchlists/${id(watchlistId)}/items`, {
            method: 'POST',
            body: { movieId },
          })
        : apiFetch<void>(`/watchlists/${id(watchlistId)}/items/${id(movieId)}`, {
            method: 'DELETE',
          }),
    onMutate: async ({ watchlistId, add }) => {
      await qc.cancelQueries({ queryKey: qk.libraryStatus(movieId) });
      const previous = qc.getQueryData<LibraryStatus>(qk.libraryStatus(movieId));
      if (previous) {
        const ids = new Set(previous.watchlistIds);
        if (add) ids.add(watchlistId);
        else ids.delete(watchlistId);
        qc.setQueryData<LibraryStatus>(qk.libraryStatus(movieId), {
          ...previous,
          watchlistIds: [...ids],
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(qk.libraryStatus(movieId), context.previous);
    },
    onSettled: (_d, _e, { watchlistId }) => {
      void qc.invalidateQueries({ queryKey: qk.libraryStatus(movieId) });
      void qc.invalidateQueries({ queryKey: qk.watchlists });
      void qc.invalidateQueries({ queryKey: qk.watchlist(watchlistId) });
    },
  });
}

export function useRemoveWatchlistItem(watchlistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (movieId: string) =>
      apiFetch<void>(`/watchlists/${id(watchlistId)}/items/${id(movieId)}`, { method: 'DELETE' }),
    onMutate: async (movieId) => {
      await qc.cancelQueries({ queryKey: qk.watchlist(watchlistId) });
      const previous = qc.getQueryData<WatchlistDetail>(qk.watchlist(watchlistId));
      if (previous) {
        qc.setQueryData<WatchlistDetail>(qk.watchlist(watchlistId), {
          ...previous,
          items: previous.items.filter((item) => item.movie.id !== movieId),
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(qk.watchlist(watchlistId), context.previous);
    },
    onSettled: (_d, _e, movieId) => {
      void qc.invalidateQueries({ queryKey: qk.watchlist(watchlistId) });
      void qc.invalidateQueries({ queryKey: qk.watchlists });
      void qc.invalidateQueries({ queryKey: qk.libraryStatus(movieId) });
    },
  });
}

// ---------- History ----------
export function useHistory(page: number, enabled = true) {
  return useQuery({
    queryKey: qk.history(page),
    queryFn: () => apiFetch<Paginated<HistoryEntry>>('/history', { query: { page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useContinueWatching(enabled = true) {
  return useQuery({
    queryKey: qk.continueWatching,
    queryFn: () => apiFetch<ItemList<HistoryEntry>>('/history/continue'),
    enabled,
  });
}

export function useRemoveHistoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (movieId: string) =>
      apiFetch<void>(`/history/${id(movieId)}`, { method: 'DELETE' }),
    onSuccess: (_d, movieId) => {
      void qc.invalidateQueries({ queryKey: qk.historyAll });
      void qc.invalidateQueries({ queryKey: qk.continueWatching });
      void qc.invalidateQueries({ queryKey: qk.libraryStatus(movieId) });
    },
  });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/history', { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.historyAll });
      void qc.invalidateQueries({ queryKey: qk.continueWatching });
      void qc.invalidateQueries({ queryKey: ['library', 'status'] });
    },
  });
}

export function saveProgress(
  input: { movieId: string; positionSec: number; durationSec?: number },
  options: { keepalive?: boolean } = {},
) {
  return apiFetch<void>('/history/progress', {
    method: 'PUT',
    body: {
      movieId: input.movieId,
      positionSec: Math.max(0, Math.round(input.positionSec * 10) / 10),
      ...(input.durationSec && Number.isFinite(input.durationSec)
        ? { durationSec: Math.round(input.durationSec * 10) / 10 }
        : {}),
    },
    keepalive: options.keepalive,
  });
}
