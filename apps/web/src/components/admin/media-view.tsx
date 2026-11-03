'use client';

import { MEDIA_ASSET_STATUSES, type MediaAssetStatus } from '@jandi/shared';
import {
  Ban,
  CheckCircle2,
  Clock,
  HardDriveUpload,
  MoreHorizontal,
  Play,
  Plus,
  ShieldAlert,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { isApiError } from '@/lib/api';
import {
  ADMIN_PAGE_SIZE,
  useAdminMedia,
  useSetMediaStatus,
  type AdminMediaAsset,
} from '@/lib/queries/admin';
import { formatRelative } from '@/lib/utils';
import { ActionDialog } from './action-dialog';
import { AddMediaDialog } from './add-media-dialog';
import { adminErrorMessage, formatBytes, formatDuration } from './admin-utils';
import {
  AdminPageHeader,
  AdminQueryError,
  FilterSelect,
  ResultSummary,
  TableFrame,
  TableSkeleton,
  Th,
  Toolbar,
  enumParam,
  tdClass,
  trClass,
  usePageParam,
} from './admin-ui';

const STATUS_LABEL: Record<MediaAssetStatus, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISABLED: 'Disabled',
};

export function MediaStatusBadge({ status }: { status: MediaAssetStatus }) {
  switch (status) {
    case 'APPROVED':
      return (
        <Badge variant="playable">
          <CheckCircle2 aria-hidden="true" />
          Approved
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="demo">
          <Clock aria-hidden="true" />
          Pending
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge variant="danger">
          <XCircle aria-hidden="true" />
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Ban aria-hidden="true" />
          Disabled
        </Badge>
      );
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Blocked = { asset: AdminMediaAsset; message: string };

function StatusDialog({
  asset,
  status,
  onClose,
  onBlocked,
}: {
  asset: AdminMediaAsset;
  status: MediaAssetStatus;
  onClose: () => void;
  onBlocked: (b: Blocked) => void;
}) {
  const mutation = useSetMediaStatus();
  const [error, setError] = React.useState<string | null>(null);
  const copy: Record<MediaAssetStatus, { title: string; body: string; cta: string }> = {
    APPROVED: {
      title: `Approve “${asset.label}”?`,
      body: `It becomes playable for ${asset.movie.title} as long as its license stays verified and in its validity window.`,
      cta: 'Approve',
    },
    REJECTED: {
      title: `Reject “${asset.label}”?`,
      body:
        asset.status === 'APPROVED'
          ? `${asset.movie.title} stops using this file straight away.`
          : 'The asset stays on record but can’t be played.',
      cta: 'Reject asset',
    },
    DISABLED: {
      title: `Disable “${asset.label}”?`,
      body: `${asset.movie.title} stops using this file straight away. You can approve it again later.`,
      cta: 'Disable asset',
    },
    PENDING: {
      title: `Move “${asset.label}” back to review?`,
      body:
        asset.status === 'APPROVED'
          ? `${asset.movie.title} stops using this file until it is approved again.`
          : 'It returns to the review queue.',
      cta: 'Move to review',
    },
  };
  const c = copy[status];
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      destructive={status === 'REJECTED' || status === 'DISABLED'}
      title={c.title}
      description={c.body}
      confirmLabel={c.cta}
      pendingLabel="Saving"
      pending={mutation.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        mutation.mutate(
          { id: asset.id, status },
          {
            onSuccess: ({ asset: saved }) => {
              toast.success(
                saved.status === 'APPROVED'
                  ? saved.playable
                    ? `Approved — ${saved.movie.title} is now playable`
                    : `Approved “${saved.label}”`
                  : `“${saved.label}” is now ${STATUS_LABEL[saved.status].toLowerCase()}`,
              );
              onClose();
            },
            onError: (e) => {
              if (isApiError(e) && e.code === 'LICENSE_NOT_VERIFIED') {
                onBlocked({ asset, message: adminErrorMessage(e) });
                onClose();
                return;
              }
              setError(adminErrorMessage(e));
            },
          },
        );
      }}
    />
  );
}

function BlockedNotice({ blocked, onDismiss }: { blocked: Blocked; onDismiss: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, [blocked]);
  const { license } = blocked.asset;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-warning/35 bg-warning/[0.07] p-4 outline-none sm:flex-row sm:items-start"
    >
      <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          “{blocked.asset.label}” for {blocked.asset.movie.title} can’t be approved yet
        </p>
        <p className="mt-1 text-sm text-muted">
          Its license <span className="text-foreground">“{license.title}”</span> is{' '}
          {license.verified ? 'verified but outside its validity window' : 'not verified'}. Check
          the license terms, verify it, then approve the asset again.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/admin/licenses?q=${encodeURIComponent(license.title.slice(0, 80))}`}>
              Review the license
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden sm:inline-flex"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

function RowActions({
  asset,
  onStatus,
}: {
  asset: AdminMediaAsset;
  onStatus: (status: MediaAssetStatus) => void;
}) {
  const others = (['PENDING', 'REJECTED', 'DISABLED'] as const).filter((s) => s !== asset.status);
  return (
    <span className="inline-flex items-center gap-1">
      {asset.status !== 'APPROVED' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStatus('APPROVED')}
          aria-label={`Approve ${asset.label} for ${asset.movie.title}`}
        >
          <CheckCircle2 aria-hidden="true" />
          Approve
        </Button>
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${asset.label} (${asset.movie.title})`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {others.map((s) => (
            <DropdownMenuItem key={s} destructive={s !== 'PENDING'} onSelect={() => onStatus(s)}>
              {s === 'PENDING' ? (
                <Undo2 aria-hidden="true" />
              ) : s === 'REJECTED' ? (
                <XCircle aria-hidden="true" />
              ) : (
                <Ban aria-hidden="true" />
              )}
              {s === 'PENDING' ? 'Move back to review…' : s === 'REJECTED' ? 'Reject…' : 'Disable…'}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

export function MediaView() {
  const { params, set } = useUrlState();
  const { page, setPage } = usePageParam();
  const status = enumParam(params.get('status'), MEDIA_ASSET_STATUSES);
  const rawMovie = params.get('movieId') ?? '';
  const movieId = UUID.test(rawMovie) ? rawMovie : '';
  const query = useAdminMedia({ status: status || undefined, movieId: movieId || undefined, page });
  const [adding, setAdding] = React.useState(false);
  const [pending, setPending] = React.useState<{
    asset: AdminMediaAsset;
    status: MediaAssetStatus;
  } | null>(null);
  const [blocked, setBlocked] = React.useState<Blocked | null>(null);
  const movieTitle = movieId ? query.data?.items[0]?.movie.title : undefined;

  return (
    <div>
      <AdminPageHeader
        title="Media assets"
        description="Video files attached to movies. Approving needs a verified license inside its validity window."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            Add media
          </Button>
        }
      />
      <Toolbar>
        <FilterSelect
          id="filter-media-status"
          label="Status"
          value={status}
          onValueChange={(v) => set({ status: v || null })}
          options={MEDIA_ASSET_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          allLabel="All statuses"
        />
        {movieId ? (
          <div className="grid gap-1.5">
            <span className="text-xs text-muted">Movie</span>
            <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-secondary pl-4 pr-1 text-sm">
              <span className="max-w-56 truncate">{movieTitle ?? 'Selected movie'}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear movie filter"
                onClick={() => set({ movieId: null })}
              >
                <X aria-hidden="true" />
              </Button>
            </span>
          </div>
        ) : null}
      </Toolbar>

      <div className="mt-5 grid grid-cols-1 gap-4">
        {blocked ? <BlockedNotice blocked={blocked} onDismiss={() => setBlocked(null)} /> : null}
        {query.data ? (
          <ResultSummary
            total={query.data.total}
            page={query.data.page}
            pageSize={ADMIN_PAGE_SIZE}
            noun="assets"
          />
        ) : null}
        {query.isLoading ? (
          <TableSkeleton label="Loading media assets" />
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Media assets didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={HardDriveUpload}
            title={status || movieId ? 'No assets match these filters' : 'No media assets yet'}
            description={
              status || movieId
                ? 'Try another status or clear the movie filter.'
                : 'Upload a WebM or MP4 file and register it against a movie and its license.'
            }
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" />
                Add media
              </Button>
            }
          />
        ) : (
          <>
            <TableFrame
              caption={`Media assets, page ${query.data.page} of ${query.data.totalPages}`}
              busy={query.isFetching && query.isPlaceholderData}
              minWidth={1000}
            >
              <thead>
                <tr>
                  <Th>Asset</Th>
                  <Th>File</Th>
                  <Th>License</Th>
                  <Th>Status</Th>
                  <Th>Playback</Th>
                  <Th>Added</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((a) => (
                  <tr key={a.id} className={trClass}>
                    <th scope="row" className={`${tdClass} max-w-60 font-normal`}>
                      <Link
                        href={`/movies/${a.movie.id}`}
                        className="block truncate rounded-sm font-medium hover:underline focus-ring"
                      >
                        {a.movie.title}
                      </Link>
                      <span className="block truncate text-xs text-muted">{a.label}</span>
                    </th>
                    <td className={`${tdClass} max-w-64`}>
                      <code className="block truncate font-mono text-xs" title={a.storageKey}>
                        {a.storageKey}
                      </code>
                      <span className="block text-xs text-muted">
                        {a.format} · {formatDuration(a.durationSec)}
                        {a.sizeBytes != null ? ` · ${formatBytes(a.sizeBytes)}` : ''}
                      </span>
                    </td>
                    <td className={`${tdClass} max-w-60`}>
                      <span className="block truncate">{a.license.title}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {a.license.verified ? (
                          <Badge variant={a.license.usable ? 'playable' : 'demo'}>
                            {a.license.usable ? 'Verified' : 'Verified · out of window'}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Unverified</Badge>
                        )}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <MediaStatusBadge status={a.status} />
                      {a.approvedBy ? (
                        <span className="mt-0.5 block text-xs text-muted">
                          by @{a.approvedBy.username}
                        </span>
                      ) : null}
                    </td>
                    <td className={tdClass}>
                      {a.playable ? (
                        <Badge variant="playable">
                          <Play className="fill-current" aria-hidden="true" />
                          Live
                        </Badge>
                      ) : (
                        <span className="text-muted">Not playable</span>
                      )}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>
                      {formatRelative(a.createdAt)}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <RowActions asset={a} onStatus={(s) => setPending({ asset: a, status: s })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <Pagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {adding ? (
        <AddMediaDialog
          open
          onOpenChange={setAdding}
          initialMovie={movieId && movieTitle ? { id: movieId, title: movieTitle } : null}
          onRegistered={() => set({ status: 'PENDING' })}
        />
      ) : null}
      {pending ? (
        <StatusDialog
          key={`${pending.asset.id}-${pending.status}`}
          asset={pending.asset}
          status={pending.status}
          onClose={() => setPending(null)}
          onBlocked={setBlocked}
        />
      ) : null}
    </div>
  );
}
