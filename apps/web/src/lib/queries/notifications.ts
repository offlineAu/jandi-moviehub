'use client';

import type { NotificationDto } from '@jandi/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type { Paginated } from '../types';
import { socialKeys } from './social';

export type { NotificationDto };

export interface NotificationPage extends Paginated<NotificationDto> {
  unreadCount: number;
}

export const notificationKeys = {
  all: ['notifications'] as const,
  listAll: ['notifications', 'list'] as const,
  list: (page: number) => ['notifications', 'list', page] as const,
  unread: ['notifications', 'unread'] as const,
};

export const NOTIFICATIONS_PAGE_SIZE = 20;

export function useNotifications(page: number, enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(page),
    queryFn: () =>
      apiFetch<NotificationPage>('/notifications', {
        query: { page, pageSize: NOTIFICATIONS_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => apiFetch<{ unreadCount: number }>('/notifications/unread-count'),
    select: (r) => r.unreadCount,
    enabled,
    // The socket pushes new notifications; this is only a safety net for missed events.
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

type Snapshot = Array<[readonly unknown[], NotificationPage | undefined]>;

/** Optimistically patches every cached page and the unread counter; returns a rollback. */
function usePatchNotifications() {
  const qc = useQueryClient();
  return async (
    patch: (item: NotificationDto) => NotificationDto | null,
    unreadDelta: (page: NotificationPage | undefined) => number,
    unreadOverride?: number,
  ) => {
    await qc.cancelQueries({ queryKey: notificationKeys.all });
    const pages = qc.getQueriesData<NotificationPage>({ queryKey: notificationKeys.listAll });
    const unread = qc.getQueryData<{ unreadCount: number }>(notificationKeys.unread);
    let delta = 0;
    for (const [key, page] of pages) {
      if (!page) continue;
      delta = Math.min(delta, unreadDelta(page));
      const items = page.items.map(patch).filter((item): item is NotificationDto => item !== null);
      const unreadCount = Math.max(0, page.unreadCount + unreadDelta(page));
      qc.setQueryData<NotificationPage>(key, {
        ...page,
        items,
        total: page.total - (page.items.length - items.length),
        unreadCount,
      });
    }
    if (unread) {
      qc.setQueryData(notificationKeys.unread, {
        unreadCount: unreadOverride ?? Math.max(0, unread.unreadCount + delta),
      });
    }
    const snapshot: Snapshot = pages;
    return () => {
      for (const [key, page] of snapshot) qc.setQueryData(key, page);
      if (unread) qc.setQueryData(notificationKeys.unread, unread);
    };
  };
}

function useNotificationMutation<V>(
  mutationFn: (vars: V) => Promise<void>,
  optimistic: (vars: V) => {
    patch: (item: NotificationDto) => NotificationDto | null;
    unreadDelta: (page: NotificationPage | undefined) => number;
    unreadOverride?: number;
  },
) {
  const qc = useQueryClient();
  const patchAll = usePatchNotifications();
  return useMutation({
    mutationFn,
    onMutate: async (vars: V) => {
      const { patch, unreadDelta, unreadOverride } = optimistic(vars);
      return { rollback: await patchAll(patch, unreadDelta, unreadOverride) };
    },
    onError: (_e, _v, context) => context?.rollback(),
    onSettled: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

const isUnread = (page: NotificationPage | undefined, id: string) =>
  !!page?.items.some((n) => n.id === id && !n.readAt);

export function useMarkNotificationRead() {
  return useNotificationMutation(
    (id: string) =>
      apiFetch<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
    (id) => {
      const now = new Date().toISOString();
      return {
        patch: (n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n),
        unreadDelta: (page) => (isUnread(page, id) ? -1 : 0),
      };
    },
  );
}

export function useMarkAllNotificationsRead() {
  return useNotificationMutation(
    () => apiFetch<void>('/notifications/read-all', { method: 'POST' }),
    () => {
      const now = new Date().toISOString();
      return {
        patch: (n) => (n.readAt ? n : { ...n, readAt: now }),
        unreadDelta: (page) => -(page?.unreadCount ?? 0),
        unreadOverride: 0,
      };
    },
  );
}

export function useDeleteNotification() {
  return useNotificationMutation(
    (id: string) =>
      apiFetch<void>(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    (id) => ({
      patch: (n) => (n.id === id ? null : n),
      unreadDelta: (page) => (isUnread(page, id) ? -1 : 0),
    }),
  );
}

/** Applies a live `notification` socket event to the caches. */
export function useReceiveNotification() {
  const qc = useQueryClient();
  return (notification: NotificationDto) => {
    const unread = qc.getQueryData<{ unreadCount: number }>(notificationKeys.unread);
    if (unread && !notification.readAt) {
      qc.setQueryData(notificationKeys.unread, { unreadCount: unread.unreadCount + 1 });
    } else {
      void qc.invalidateQueries({ queryKey: notificationKeys.unread });
    }
    void qc.invalidateQueries({ queryKey: notificationKeys.listAll });
    // Friend requests/acceptances change friends, requests, search statuses and profiles.
    if (notification.type.startsWith('FRIEND_')) {
      void qc.invalidateQueries({ queryKey: socialKeys.all });
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    }
  };
}
