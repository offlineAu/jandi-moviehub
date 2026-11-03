'use client';

import { ArrowUpRight, Gauge, RotateCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminOverview, type AdminOverview, type SyncStats } from '@/lib/queries/admin';
import { cn, formatRelative } from '@/lib/utils';
import { formatCount, formatPercent } from './admin-utils';
import { AdminPageHeader, AdminQueryError } from './admin-ui';

function StatTile({
  label,
  value,
  detail,
  href,
  hrefLabel,
  emphasis,
}: {
  label: string;
  value: number;
  detail?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-32 flex-col justify-between gap-3 rounded-2xl border bg-surface/60 p-5',
        emphasis ? 'border-warning/40' : 'border-border',
      )}
    >
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="grid gap-1">
        <span className="font-sans text-3xl font-semibold tracking-tight">
          {formatCount(value)}
        </span>
        {detail ? <span className="text-xs text-muted">{detail}</span> : null}
        {href ? (
          <Link
            href={href}
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground focus-ring"
            aria-label={hrefLabel ?? `Open ${label}`}
          >
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </dd>
    </div>
  );
}

const STATUS_ROWS = [
  { key: 'PENDING', label: 'Pending review', dot: 'bg-warning' },
  { key: 'APPROVED', label: 'Approved', dot: 'bg-success' },
  { key: 'REJECTED', label: 'Rejected', dot: 'bg-danger' },
  { key: 'DISABLED', label: 'Disabled', dot: 'bg-subtle' },
] as const;

function MediaCard({ data }: { data: AdminOverview }) {
  return (
    <section
      aria-labelledby="media-status-title"
      className="rounded-2xl border border-border bg-surface/60 p-5"
    >
      <h2 id="media-status-title" className="font-display text-base font-semibold">
        Media assets
      </h2>
      <p className="mt-1 text-xs text-muted">
        {formatCount(data.movies.playable)} of {formatCount(data.movies.total)} movies are playable
      </p>
      <ul className="mt-4 grid gap-1">
        {STATUS_ROWS.map((row) => (
          <li key={row.key}>
            <Link
              href={`/admin/media?status=${row.key}`}
              className="flex h-10 items-center gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-white/[0.04] focus-ring"
            >
              <span className={cn('size-2 rounded-full', row.dot)} aria-hidden="true" />
              <span className="flex-1 text-muted">{row.label}</span>
              <span className="font-medium tabular-nums">
                {formatCount(data.mediaAssets[row.key])}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-subtle">{hint}</dd> : null}
    </div>
  );
}

function SyncCard({ sync }: { sync: SyncStats }) {
  const empty = !sync.samples || sync.p50Ms == null;
  return (
    <section
      aria-labelledby="sync-title"
      className="rounded-2xl border border-border bg-surface/60 p-5 lg:col-span-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sync-title" className="font-display text-base font-semibold">
          Watch-party sync quality
        </h2>
        <p className="text-xs text-muted">
          {empty
            ? 'Rolling window of client drift reports'
            : `${formatCount(sync.samples)} drift sample${sync.samples === 1 ? '' : 's'} (rolling window)`}
        </p>
      </div>
      {empty ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-6 text-sm text-muted">
          <Gauge className="size-5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">No samples yet.</span> Viewers’ players
            report playback drift while they watch together in a room; figures appear once someone
            does.
          </p>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label="Median drift (p50)" value={`${sync.p50Ms} ms`} />
          <Figure
            label="95th percentile (p95)"
            value={`${sync.p95Ms} ms`}
            hint={`max ${sync.maxMs} ms`}
          />
          <Figure label="Within 100 ms" value={formatPercent(sync.within100ms)} />
          <Figure label="Within 250 ms" value={formatPercent(sync.within250ms)} />
        </dl>
      )}
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading overview"
      aria-busy="true"
      className="mt-6 grid grid-cols-1 gap-4"
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="grid min-h-32 gap-4 rounded-2xl border border-border bg-surface/60 p-5"
          >
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-8 w-1/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}

export function OverviewView() {
  const query = useAdminOverview();
  const data = query.data;
  return (
    <div>
      <AdminPageHeader
        title="Overview"
        description="Live counts straight from the database."
        actions={
          data ? (
            <>
              <span className="text-xs text-muted" aria-live="polite">
                Updated {formatRelative(data.generatedAt)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void query.refetch()}
                loading={query.isFetching}
                loadingText="Refreshing"
              >
                <RotateCw aria-hidden="true" />
                Refresh
              </Button>
            </>
          ) : null
        }
      />
      {query.isLoading ? (
        <OverviewSkeleton />
      ) : query.isError || !data ? (
        <div className="mt-6">
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="The overview didn’t load"
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            <StatTile
              label="Users"
              value={data.users.total}
              detail={`${formatCount(data.users.registered)} registered · ${formatCount(data.users.guests)} guests`}
              href="/admin/users"
            />
            <StatTile
              label="New accounts, 7 days"
              value={data.users.newLast7d}
              detail="Registered, excluding guests"
              href="/admin/analytics?days=7"
              hrefLabel="Open analytics for the last 7 days"
            />
            <StatTile label="Suspended accounts" value={data.users.suspended} />
            <StatTile
              label="Open reports"
              value={data.reports.open}
              detail={data.reports.open ? 'Waiting for a moderator' : 'Queue is clear'}
              href="/admin/reports"
              emphasis={data.reports.open > 0}
            />
            <StatTile
              label="Open rooms"
              value={data.rooms.open}
              detail={`${formatCount(data.rooms.recentlyActiveRooms)} active in the last ${data.rooms.recentlyActiveWindowMin} min`}
              href="/admin/rooms"
            />
            <StatTile label="Rooms created, 7 days" value={data.rooms.createdLast7d} />
            <StatTile
              label="Chat messages, 24 h"
              value={data.messages.last24h}
              detail="System notices excluded"
            />
            <StatTile
              label="Movies"
              value={data.movies.total}
              detail={`${formatCount(data.movies.playable)} playable`}
              href="/admin/movies"
            />
          </dl>
          <div className="grid gap-4 lg:grid-cols-3">
            <MediaCard data={data} />
            <SyncCard sync={data.sync} />
          </div>
        </div>
      )}
    </div>
  );
}
