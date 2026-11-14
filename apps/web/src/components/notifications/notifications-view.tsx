'use client';

import type { NotificationDto } from '@jandi/shared';
import { BellOff, BellRing, CheckCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { RequireAccount } from '@/components/layout/require-account';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { resolvePreferences } from '@/lib/queries/auth';
import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/queries/notifications';
import type { Me } from '@/lib/types';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import { notificationHref, notificationIcon } from './notification-utils';

function NotificationRow({ notification }: { notification: NotificationDto }) {
  const router = useRouter();
  const markRead = useMarkNotificationRead();
  const remove = useDeleteNotification();
  const unread = !notification.readAt;
  const href = notificationHref(notification.link);
  const Icon = notificationIcon(notification.type);

  const onOpen = (e: React.MouseEvent) => {
    if (unread) markRead.mutate(notification.id);
    if (href) {
      // Let modifier-clicks open a new tab normally.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      router.push(href);
    }
  };

  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 grid size-10 shrink-0 place-items-center rounded-full ring-1',
          unread
            ? 'bg-primary/15 text-primary ring-primary/30'
            : 'bg-glass-2 text-muted ring-white/10',
        )}
        aria-hidden="true"
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm leading-snug',
            unread ? 'font-semibold text-foreground' : 'text-foreground/85',
          )}
        >
          {unread ? <span className="sr-only">Unread: </span> : null}
          {notification.title}
        </span>
        {notification.body ? (
          <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{notification.body}</span>
        ) : null}
        <time
          dateTime={notification.createdAt}
          title={formatDate(notification.createdAt) ?? undefined}
          className="mt-1 block text-xs text-subtle"
        >
          {formatRelative(notification.createdAt)}
        </time>
      </span>
    </>
  );

  const mainClass =
    'flex min-w-0 flex-1 items-start gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset sm:p-4';

  return (
    <li
      className={cn(
        'group relative flex items-start rounded-xl border transition-colors',
        unread
          ? 'border-primary/25 bg-primary/[0.06] hover:bg-primary/[0.09]'
          : 'border-border bg-surface hover:border-border-strong',
      )}
    >
      {href ? (
        <Link href={href} onClick={onOpen} className={mainClass}>
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={mainClass}
          aria-disabled={!unread || undefined}
        >
          {content}
        </button>
      )}
      <div className="flex shrink-0 items-center gap-1 p-2 sm:p-3">
        {unread ? <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" /> : null}
        <Tooltip label="Delete notification">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete notification: ${notification.title}`}
            onClick={() =>
              remove.mutate(notification.id, {
                onSuccess: () => toast.success('Notification deleted'),
                onError: (error) =>
                  toast.error(errorMessage(error, 'Couldn’t delete the notification.')),
              })
            }
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="grid gap-2" aria-busy="true" aria-label="Loading notifications">
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <Skeleton className="size-10 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NotificationsList({ me }: { me: Me }) {
  const { params, set } = useUrlState();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = useNotifications(page);
  const markAll = useMarkAllNotificationsRead();
  const unreadCount = query.data?.unreadCount ?? 0;
  const browserOn = resolvePreferences(me).browserNotifications;

  let body: React.ReactNode;
  if (query.isLoading) body = <ListSkeleton />;
  else if (query.isError) {
    body = (
      <ErrorState
        title="Notifications didn’t load"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  } else if (!query.data?.items.length) {
    body = (
      <EmptyState
        icon={BellOff}
        title={page > 1 ? 'Nothing on this page' : 'You’re all caught up'}
        description={
          page > 1
            ? 'Notifications may have been deleted.'
            : 'Friend requests, room invites and watch-party reminders will show up here.'
        }
        action={
          page > 1 ? (
            <Button variant="secondary" onClick={() => set({ page: null }, { resetPage: false })}>
              Back to the newest
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <>
        <ul
          className="grid gap-2"
          aria-label="Notifications"
          aria-busy={query.isFetching || undefined}
        >
          {query.data.items.map((n) => (
            <NotificationRow key={n.id} notification={n} />
          ))}
        </ul>
        <Pagination
          className="mt-8"
          page={query.data.page}
          totalPages={query.data.totalPages}
          onPageChange={(p) => set({ page: p === 1 ? null : p }, { resetPage: false })}
        />
      </>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {query.data
              ? unreadCount
                ? `${unreadCount} unread`
                : 'No unread notifications'
              : 'Updates from friends and watch parties.'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!unreadCount}
          loading={markAll.isPending}
          loadingText="Marking"
          onClick={() =>
            markAll.mutate(undefined, {
              onSuccess: () => toast.success('All notifications marked as read'),
              onError: (error) => toast.error(errorMessage(error, 'Couldn’t mark them as read.')),
            })
          }
        >
          <CheckCheck aria-hidden="true" />
          Mark all read
        </Button>
      </div>
      {!browserOn ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <BellRing className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Want desktop alerts when you’re in another tab?{' '}
            <Link href="/settings?tab=preferences" className="rounded link-fx focus-ring">
              Turn on browser notifications
            </Link>
          </span>
        </p>
      ) : null}
      <div className="mt-6">{body}</div>
    </div>
  );
}

export function NotificationsView() {
  return (
    <RequireAccount feature="Notifications">
      {(me) => (
        <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <NotificationsList me={me} />
        </div>
      )}
    </RequireAccount>
  );
}
