'use client';

import { REPORT_STATUSES, REPORT_TARGETS, type ReportTarget } from '@jandi/shared';
import {
  CheckCircle2,
  Clapperboard,
  DoorClosed,
  ExternalLink,
  Flag,
  ListVideo,
  MessageSquare,
  Trash2,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ADMIN_PAGE_SIZE,
  useAdminReports,
  useDeleteMessage,
  useResolveReport,
  type AdminReport,
} from '@/lib/queries/admin';
import { formatRelative } from '@/lib/utils';
import { ActionDialog } from './action-dialog';
import { useStaff } from './admin-shell';
import { adminErrorMessage, formatDateTime } from './admin-utils';
import {
  AdminPageHeader,
  AdminQueryError,
  FilterSelect,
  ResultSummary,
  Toolbar,
  UserCell,
  enumParam,
  usePageParam,
} from './admin-ui';
import { CloseRoomDialog } from './rooms-view';

const TARGET_META: Record<ReportTarget, { label: string; icon: LucideIcon }> = {
  USER: { label: 'User', icon: UserRound },
  MESSAGE: { label: 'Chat message', icon: MessageSquare },
  ROOM: { label: 'Room', icon: Clapperboard },
  PLAYLIST: { label: 'Playlist', icon: ListVideo },
};

const STATUS_FILTERS = [...REPORT_STATUSES, 'ALL'] as const;

function ReportStatusBadge({ status }: { status: AdminReport['status'] }) {
  if (status === 'OPEN')
    return (
      <Badge variant="demo">
        <Flag aria-hidden="true" />
        Open
      </Badge>
    );
  if (status === 'RESOLVED')
    return (
      <Badge variant="playable">
        <CheckCircle2 aria-hidden="true" />
        Resolved
      </Badge>
    );
  return (
    <Badge variant="outline">
      <XCircle aria-hidden="true" />
      Dismissed
    </Badge>
  );
}

function TargetPreview({
  report,
  isAdmin,
  onDeleteMessage,
  onCloseRoom,
}: {
  report: AdminReport;
  isAdmin: boolean;
  onDeleteMessage: () => void;
  onCloseRoom: () => void;
}) {
  const t = report.target;
  const box = 'rounded-xl border border-border bg-secondary/50 p-3.5';
  if (!t) {
    return (
      <div className={`${box} text-sm text-muted`}>
        The reported {TARGET_META[report.targetType].label.toLowerCase()} has since been deleted.
      </div>
    );
  }
  switch (t.type) {
    case 'USER':
      return (
        <div className={`${box} flex flex-wrap items-center justify-between gap-3`}>
          <UserCell user={t.user} />
          <span className="flex flex-wrap items-center gap-2">
            {t.suspended ? <Badge variant="danger">Suspended</Badge> : null}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/profile/${t.user.username}`}>
                Profile
                <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
            {isAdmin ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/users?q=${encodeURIComponent(t.user.username)}`}>
                  Manage user
                </Link>
              </Button>
            ) : null}
          </span>
        </div>
      );
    case 'MESSAGE':
      return (
        <div className={`${box} grid gap-2.5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <UserCell user={t.author} size="xs" sub={`in ${t.room.name}`} />
            <span className="text-xs text-muted">{formatDateTime(t.createdAt)}</span>
          </div>
          <blockquote
            className={`whitespace-pre-wrap break-words border-l-2 pl-3 text-sm ${t.deleted ? 'border-border text-subtle line-through' : 'border-primary/50'}`}
          >
            {t.body}
          </blockquote>
          <div className="flex flex-wrap items-center gap-2">
            {t.deleted ? (
              <Badge variant="outline">
                <Trash2 aria-hidden="true" />
                Message deleted
              </Badge>
            ) : (
              <Button variant="destructive" size="sm" onClick={onDeleteMessage}>
                <Trash2 aria-hidden="true" />
                Delete message
              </Button>
            )}
          </div>
        </div>
      );
    case 'ROOM':
      return (
        <div className={`${box} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0">
            <p className="truncate font-medium">{t.name}</p>
            <p className="text-xs text-muted">
              <span className="font-display tracking-[0.14em]">{t.code}</span> ·{' '}
              {t.visibility.toLowerCase()} · hosted by @{t.host.username}
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-2">
            {t.status === 'CLOSED' ? (
              <Badge variant="outline">Closed</Badge>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/rooms/${t.code}`}>
                    Open
                    <ExternalLink aria-hidden="true" />
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={onCloseRoom}>
                  <DoorClosed aria-hidden="true" />
                  Close room
                </Button>
              </>
            )}
          </span>
        </div>
      );
    case 'PLAYLIST':
      return (
        <div className={`${box} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0">
            <p className="truncate font-medium">{t.name}</p>
            <p className="text-xs text-muted">
              {t.visibility.toLowerCase()} playlist by @{t.owner.username}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/playlists/${t.id}`}>
              View
              <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        </div>
      );
  }
}

function ResolveDialog({
  report,
  status,
  onClose,
}: {
  report: AdminReport;
  status: 'RESOLVED' | 'DISMISSED';
  onClose: () => void;
}) {
  const resolve = useResolveReport();
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const dismiss = status === 'DISMISSED';
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={dismiss ? 'Dismiss this report?' : 'Mark this report resolved?'}
      description={
        dismiss
          ? 'Use this when the report doesn’t break the rules. The reporter’s report is closed with no action.'
          : 'Use this after you have dealt with the reported content (deleted it, closed the room or suspended the user).'
      }
      confirmLabel={dismiss ? 'Dismiss report' : 'Resolve report'}
      pendingLabel="Saving"
      pending={resolve.isPending}
      confirmDisabled={note.length > 500}
      error={error}
      onConfirm={() => {
        setError(null);
        resolve.mutate(
          { id: report.id, status, ...(note.trim() ? { resolutionNote: note.trim() } : {}) },
          {
            onSuccess: () => {
              toast.success(dismiss ? 'Report dismissed' : 'Report resolved');
              onClose();
            },
            onError: (e) => setError(adminErrorMessage(e)),
          },
        );
      }}
    >
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="resolution-note">Note (optional)</Label>
          <span
            className={`text-xs tabular-nums ${note.length > 500 ? 'text-danger' : 'text-subtle'}`}
            aria-live="polite"
          >
            {note.length}/500
          </span>
        </div>
        <Textarea
          id="resolution-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={note.length > 500 || undefined}
          placeholder={dismiss ? 'Why it doesn’t break the rules' : 'What you did about it'}
        />
      </div>
    </ActionDialog>
  );
}

function DeleteMessageDialog({ report, onClose }: { report: AdminReport; onClose: () => void }) {
  const remove = useDeleteMessage();
  const [error, setError] = React.useState<string | null>(null);
  const target = report.target?.type === 'MESSAGE' ? report.target : null;
  if (!target) return null;
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      destructive
      title="Delete this message?"
      description={`It disappears from “${target.room.name}” for everyone straight away. The report stays open so you can resolve it with a note.`}
      confirmLabel="Delete message"
      pendingLabel="Deleting"
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        remove.mutate(target.id, {
          onSuccess: () => {
            toast.success('Message deleted');
            onClose();
          },
          onError: (e) => setError(adminErrorMessage(e)),
        });
      }}
    />
  );
}

type Pending =
  | { kind: 'resolve'; report: AdminReport; status: 'RESOLVED' | 'DISMISSED' }
  | { kind: 'delete'; report: AdminReport }
  | { kind: 'close'; report: AdminReport }
  | null;

function ReportCard({
  report,
  isAdmin,
  onAction,
}: {
  report: AdminReport;
  isAdmin: boolean;
  onAction: (p: Pending) => void;
}) {
  const meta = TARGET_META[report.targetType];
  const headingId = `report-${report.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-4 rounded-2xl border border-border bg-surface/60 p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.05] text-muted ring-1 ring-white/10">
            <meta.icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="font-display text-base font-semibold">
              {meta.label} reported
            </h2>
            <p className="text-xs text-muted">
              {report.reporter ? `by @${report.reporter.username}` : 'by a deleted account'} ·{' '}
              <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>
                {formatRelative(report.createdAt)}
              </time>
            </p>
          </div>
        </div>
        <ReportStatusBadge status={report.status} />
      </header>
      <div>
        <p className="text-xs font-medium text-subtle">Reason</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{report.reason}</p>
      </div>
      <TargetPreview
        report={report}
        isAdmin={isAdmin}
        onDeleteMessage={() => onAction({ kind: 'delete', report })}
        onCloseRoom={() => onAction({ kind: 'close', report })}
      />
      {report.status === 'OPEN' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => onAction({ kind: 'resolve', report, status: 'RESOLVED' })}
          >
            <CheckCircle2 aria-hidden="true" />
            Resolve…
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAction({ kind: 'resolve', report, status: 'DISMISSED' })}
          >
            <XCircle aria-hidden="true" />
            Dismiss…
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {report.status === 'RESOLVED' ? 'Resolved' : 'Dismissed'}
          {report.resolvedBy ? ` by @${report.resolvedBy.username}` : ''}
          {report.resolvedAt ? ` ${formatRelative(report.resolvedAt)}` : ''}
          {report.resolutionNote ? (
            <>
              : <span className="text-foreground">“{report.resolutionNote}”</span>
            </>
          ) : null}
        </p>
      )}
    </article>
  );
}

export function ReportsView() {
  const staff = useStaff();
  const { params, set } = useUrlState();
  const { page, setPage } = usePageParam();
  const statusParam = enumParam(params.get('status'), STATUS_FILTERS) || 'OPEN';
  const targetType = enumParam(params.get('target'), REPORT_TARGETS);
  const query = useAdminReports({
    status: statusParam === 'ALL' ? undefined : statusParam,
    targetType: targetType || undefined,
    page,
  });
  const [pending, setPending] = React.useState<Pending>(null);

  return (
    <div>
      <AdminPageHeader
        title="Reports"
        description="Reports from the community. Open reports are listed oldest first."
      />
      <Toolbar>
        <FilterSelect
          id="filter-report-status"
          label="Status"
          value={statusParam}
          onValueChange={(v) => set({ status: v === 'OPEN' ? null : v })}
          options={[
            { value: 'OPEN', label: 'Open' },
            { value: 'RESOLVED', label: 'Resolved' },
            { value: 'DISMISSED', label: 'Dismissed' },
            { value: 'ALL', label: 'All reports' },
          ]}
          allLabel={null}
        />
        <FilterSelect
          id="filter-report-target"
          label="Reported item"
          value={targetType}
          onValueChange={(v) => set({ target: v || null })}
          options={REPORT_TARGETS.map((t) => ({ value: t, label: TARGET_META[t].label }))}
          allLabel="Anything"
        />
      </Toolbar>

      <div className="mt-5 grid grid-cols-1 gap-4">
        {query.data ? (
          <ResultSummary
            total={query.data.total}
            page={query.data.page}
            pageSize={ADMIN_PAGE_SIZE}
            noun="reports"
          />
        ) : null}
        {query.isLoading ? (
          <div role="status" aria-label="Loading reports" className="grid gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Reports didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={Flag}
            title={
              statusParam === 'OPEN' && !targetType
                ? 'No open reports — the queue is clear'
                : 'No reports match these filters'
            }
            description={
              statusParam === 'OPEN' && !targetType
                ? 'New reports from the community show up here.'
                : 'Try another status or item type.'
            }
          />
        ) : (
          <>
            <ul
              className="grid gap-4 transition-opacity"
              style={{ opacity: query.isFetching && query.isPlaceholderData ? 0.6 : 1 }}
            >
              {query.data.items.map((r) => (
                <li key={r.id}>
                  <ReportCard report={r} isAdmin={staff.role === 'ADMIN'} onAction={setPending} />
                </li>
              ))}
            </ul>
            <Pagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {pending?.kind === 'resolve' ? (
        <ResolveDialog
          key={`${pending.report.id}-${pending.status}`}
          report={pending.report}
          status={pending.status}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'delete' ? (
        <DeleteMessageDialog
          key={pending.report.id}
          report={pending.report}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'close' && pending.report.target?.type === 'ROOM' ? (
        <CloseRoomDialog
          key={pending.report.id}
          room={pending.report.target}
          onClose={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}
