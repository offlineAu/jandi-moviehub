'use client';

import { CircleCheck, History, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Artwork } from '@/components/movies/artwork';
import { formatTime } from '@/components/player/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { useClearHistory, useHistory, useRemoveHistoryItem } from '@/lib/queries/library';
import { formatRelative } from '@/lib/utils';

export function HistoryTab({
  page,
  onPageChange,
}: {
  page: number;
  onPageChange: (page: number) => void;
}) {
  const query = useHistory(page);
  const remove = useRemoveHistoryItem();
  const clear = useClearHistory();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (query.isLoading) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  const data = query.data;
  if (!data?.items.length) {
    return (
      <EmptyState
        icon={History}
        title="Your watch history is empty"
        description="Titles you watch on Jandi are listed here, newest first."
        action={
          <Button asChild variant="secondary">
            <Link href="/browse?playable=true">Find something to stream</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {data.total} {data.total === 1 ? 'title' : 'titles'} watched
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          className="text-danger hover:text-danger"
        >
          <Trash2 aria-hidden="true" />
          Clear history
        </Button>
      </div>
      <ul className="grid gap-3">
        {data.items.map((entry) => {
          const pct = entry.durationSec
            ? Math.min(100, (entry.positionSec / entry.durationSec) * 100)
            : 0;
          return (
            <li
              key={entry.movie.id}
              className="relative flex items-center gap-4 rounded-xl border border-border bg-surface/70 p-3 pr-14 transition-colors hover:border-border-strong"
            >
              <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md sm:w-16">
                <Artwork
                  src={entry.movie.posterUrl}
                  alt=""
                  sizes="64px"
                  fallbackTitle={entry.movie.title}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/movies/${entry.movie.id}`}
                  className="block truncate rounded font-medium hover:underline focus-ring"
                >
                  {entry.movie.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  Watched {formatRelative(entry.lastWatchedAt)}
                  {entry.movie.year ? `, ${entry.movie.year}` : ''}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {entry.completed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                      <CircleCheck className="size-3.5" aria-hidden="true" />
                      Finished
                    </span>
                  ) : (
                    <>
                      <div
                        className="h-1 w-full max-w-48 overflow-hidden rounded-full bg-white/10"
                        role="progressbar"
                        aria-label={`Watched ${Math.round(pct)}%`}
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted">
                        {formatTime(entry.positionSec)} / {formatTime(entry.durationSec)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <Tooltip label="Remove from history">
                <button
                  type="button"
                  aria-label={`Remove ${entry.movie.title} from history`}
                  disabled={remove.isPending && remove.variables === entry.movie.id}
                  onClick={() =>
                    remove.mutate(entry.movie.id, {
                      onSuccess: () => toast.success(`Removed “${entry.movie.title}” from history`),
                      onError: (error) =>
                        toast.error(errorMessage(error, 'Couldn’t remove it. Try again.')),
                    })
                  }
                  className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-glass-3 hover:text-foreground focus-ring disabled:opacity-40"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      <Pagination
        className="mt-10"
        page={data.page}
        totalPages={data.totalPages}
        onPageChange={onPageChange}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Clear your watch history?"
        description="This removes every title and resume point from your history. It can’t be undone."
        confirmLabel="Clear history"
        pendingLabel="Clearing"
        pending={clear.isPending}
        onConfirm={() =>
          clear.mutate(undefined, {
            onSuccess: () => {
              toast.success('Watch history cleared');
              setConfirmOpen(false);
              if (page !== 1) onPageChange(1);
            },
            onError: (error) =>
              toast.error(errorMessage(error, 'Couldn’t clear history. Try again.')),
          })
        }
      />
    </>
  );
}
