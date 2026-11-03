'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type { Friendship, ItemList, PublicUser } from '../types';

/** Mirrors docs/api/ROOMS.md → Friends. */
export interface FriendWatching {
  roomCode: string | null;
  roomName: string | null;
  movieTitle: string | null;
  private: boolean;
}

export interface Friend {
  user: PublicUser;
  since: string;
  online: boolean;
  watching: FriendWatching | null;
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  createdAt: string;
}

export interface FriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export interface UserSearchResult extends PublicUser {
  friendship: Friendship;
}

export const socialKeys = {
  all: ['social'] as const,
  friends: ['social', 'friends'] as const,
  requests: ['social', 'requests'] as const,
  searchAll: ['social', 'search'] as const,
  search: (q: string) => ['social', 'search', q] as const,
};

/** Presence refresh cadence for the friends list (only while the tab is visible). */
export const FRIENDS_POLL_MS = 30_000;

export function useFriends(options: { enabled?: boolean; poll?: boolean } = {}) {
  return useQuery({
    queryKey: socialKeys.friends,
    queryFn: () => apiFetch<ItemList<Friend>>('/friends'),
    enabled: options.enabled ?? true,
    // TanStack pauses intervals while the document is hidden (refetchIntervalInBackground=false).
    refetchInterval: options.poll ? FRIENDS_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}

export function useFriendRequests(enabled = true) {
  return useQuery({
    queryKey: socialKeys.requests,
    queryFn: () => apiFetch<FriendRequests>('/friends/requests'),
    enabled,
  });
}

export function useUserSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: socialKeys.search(term),
    queryFn: ({ signal }) =>
      apiFetch<ItemList<UserSearchResult>>('/users/search', { query: { q: term }, signal }),
    enabled: term.length >= 2,
    staleTime: 15_000,
  });
}

/** Every friendship change can affect friends, requests, search statuses and profiles. */
function useInvalidateSocial() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: socialKeys.all });
    void qc.invalidateQueries({ queryKey: ['profiles'] });
  };
}

export function useSendFriendRequest() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (username: string) =>
      apiFetch<{ status: 'PENDING' | 'ACCEPTED' }>('/friends/requests', {
        method: 'POST',
        body: { username },
      }),
    onSettled: invalidate,
  });
}

export function useRespondToRequest() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      apiFetch<void>(`/friends/requests/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
    onSettled: invalidate,
  });
}

export function useCancelFriendRequest() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/friends/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: socialKeys.friends });
      const previous = qc.getQueryData<ItemList<Friend>>(socialKeys.friends);
      if (previous) {
        qc.setQueryData<ItemList<Friend>>(socialKeys.friends, {
          items: previous.items.filter((f) => f.user.id !== userId),
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(socialKeys.friends, context.previous);
    },
    onSettled: invalidate,
  });
}
