'use client';

import { SocketEvents, type NotificationDto } from '@jandi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { resolvePreferences, useMe } from '@/lib/queries/auth';
import {
  notificationKeys,
  useMarkNotificationRead,
  useReceiveNotification,
  useUnreadCount,
} from '@/lib/queries/notifications';
import { acquireSocket, releaseSocket } from '@/lib/sync/socket';
import { notificationHref, shouldShowBrowserNotification, unreadBadge } from './notification-utils';

/**
 * Top-nav bell for signed-in accounts: unread badge, live `notification` socket events with a
 * toast, and an optional desktop alert while the tab is hidden.
 */
export function NotificationBell() {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const unread = useUnreadCount();
  const receive = useReceiveNotification();
  const markRead = useMarkNotificationRead();
  const browserEnabled = resolvePreferences(me.data).browserNotifications;

  // Handlers change every render; the socket subscription should not.
  const latest = React.useRef({ receive, markRead, router, browserEnabled });
  React.useEffect(() => {
    latest.current = { receive, markRead, router, browserEnabled };
  });

  React.useEffect(() => {
    const socket = acquireSocket();
    const open = (n: NotificationDto) => {
      const href = notificationHref(n.link);
      latest.current.markRead.mutate(n.id);
      if (href) latest.current.router.push(href);
    };
    const onNotification = (n: NotificationDto) => {
      latest.current.receive(n);
      const href = notificationHref(n.link);
      toast(n.title, {
        id: `notification-${n.id}`,
        description: n.body ?? undefined,
        action: { label: href ? 'View' : 'Mark read', onClick: () => open(n) },
      });
      const permission =
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : 'unsupported';
      if (
        shouldShowBrowserNotification({
          enabled: latest.current.browserEnabled,
          permission,
          visibility: document.visibilityState,
        })
      ) {
        try {
          const desktop = new Notification(n.title, {
            body: n.body ?? undefined,
            tag: n.id,
          });
          desktop.onclick = () => {
            window.focus();
            open(n);
            desktop.close();
          };
        } catch {
          /* Some browsers only allow notifications from a service worker. */
        }
      }
    };
    // After a reconnect we may have missed events: resync the counter.
    const onConnect = () => void qc.invalidateQueries({ queryKey: notificationKeys.unread });
    socket.on(SocketEvents.NOTIFICATION, onNotification);
    socket.on('connect', onConnect);
    return () => {
      socket.off(SocketEvents.NOTIFICATION, onNotification);
      socket.off('connect', onConnect);
      releaseSocket();
    };
  }, [qc]);

  const badge = unreadBadge(unread.data);
  const label = unread.data ? `Notifications, ${unread.data} unread` : 'Notifications';

  return (
    <Tooltip label={label}>
      <Button asChild variant="ghost" size="icon" className="relative">
        <Link href="/notifications" aria-label={label}>
          <Bell aria-hidden="true" />
          {badge ? (
            <span
              aria-hidden="true"
              className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
            >
              {badge}
            </span>
          ) : null}
        </Link>
      </Button>
    </Tooltip>
  );
}
