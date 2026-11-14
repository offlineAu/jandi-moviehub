'use client';

import { ChevronDown, Filter, ScrollText, X } from 'lucide-react';
import * as React from 'react';
import { useUrlState } from '@/components/browse/use-url-state';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { ADMIN_PAGE_SIZE, useAdminAudit, type AuditEntry } from '@/lib/queries/admin';
import { cn, formatRelative } from '@/lib/utils';
import { AUDIT_ACTION_PREFIXES, describeAudit, formatDateTime } from './admin-utils';
import {
  AdminPageHeader,
  AdminQueryError,
  FilterSelect,
  ResultSummary,
  TableFrame,
  TableSkeleton,
  Th,
  Toolbar,
  tdClass,
  usePageParam,
} from './admin-ui';

const ACTION_RE = /^[a-z0-9_.-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AuditRow({
  entry,
  expanded,
  onToggle,
  onFilterActor,
}: {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
  onFilterActor: (actor: NonNullable<AuditEntry['actor']>) => void;
}) {
  const detailsId = `audit-${entry.id}`;
  const hasMetadata = entry.metadata != null && JSON.stringify(entry.metadata) !== '{}';
  return (
    <>
      <tr className={cn('transition-colors hover:bg-glass-1', expanded && 'bg-glass-1')}>
        <td className={`${tdClass} whitespace-nowrap text-muted`}>
          <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
            {formatRelative(entry.createdAt)}
          </time>
        </td>
        <th scope="row" className={`${tdClass} max-w-[28rem] font-normal`}>
          <span className="flex min-w-0 items-start gap-2.5">
            {entry.actor ? (
              <Avatar
                src={entry.actor.avatarUrl}
                name={entry.actor.displayName}
                size="xs"
                className="mt-0.5"
              />
            ) : null}
            <span className="min-w-0">
              <span className="block">
                <span className="font-medium text-foreground">
                  {entry.actor ? entry.actor.displayName : 'System'}
                </span>{' '}
                <span className="text-foreground/85">{describeAudit(entry)}</span>
              </span>
              <code className="mt-0.5 block truncate font-mono text-xs text-subtle">
                {entry.action}
              </code>
            </span>
          </span>
        </th>
        <td className={`${tdClass} whitespace-nowrap text-muted`}>
          {entry.targetType ? (
            <>
              {entry.targetType.replace(/_/g, ' ')}
              {entry.targetId ? (
                <code className="ml-1.5 font-mono text-xs text-subtle" title={entry.targetId}>
                  {entry.targetId.length > 12 ? `${entry.targetId.slice(0, 8)}…` : entry.targetId}
                </code>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </td>
        <td className={`${tdClass} text-right`}>
          <span className="inline-flex items-center gap-1">
            {entry.actor ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onFilterActor(entry.actor!)}
                aria-label={`Show only actions by ${entry.actor.displayName}`}
              >
                <Filter aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
            >
              Details
              <ChevronDown
                className={cn('transition-transform', expanded && 'rotate-180')}
                aria-hidden="true"
              />
            </Button>
          </span>
        </td>
      </tr>
      <tr id={detailsId} hidden={!expanded} className="[&>td]:border-b [&>td]:border-border/70">
        <td colSpan={4} className="bg-black/20 px-4 py-4">
          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-subtle">When</dt>
            <dd>{formatDateTime(entry.createdAt)}</dd>
            <dt className="text-subtle">Actor</dt>
            <dd>
              {entry.actor ? `${entry.actor.displayName} (@${entry.actor.username})` : 'System'}
            </dd>
            <dt className="text-subtle">Target</dt>
            <dd className="break-all font-mono">
              {entry.targetType ?? '—'}
              {entry.targetId ? ` ${entry.targetId}` : ''}
            </dd>
            <dt className="text-subtle">IP address</dt>
            <dd className="font-mono">{entry.ip ?? '—'}</dd>
            <dt className="text-subtle">Metadata</dt>
            <dd className="min-w-0">
              {hasMetadata ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-background/70 p-3 font-mono text-[12px] leading-relaxed text-foreground/90">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              ) : (
                <span className="text-muted">None recorded</span>
              )}
            </dd>
          </dl>
        </td>
      </tr>
    </>
  );
}

export function AuditView() {
  const { params, set } = useUrlState();
  const { page, setPage } = usePageParam();
  const rawAction = (params.get('action') ?? '').toLowerCase();
  const action = ACTION_RE.test(rawAction) ? rawAction : '';
  const rawActor = params.get('actor') ?? '';
  const actorId = UUID.test(rawActor) ? rawActor : '';
  const actorName = params.get('actorName')?.slice(0, 60) ?? '';
  const query = useAdminAudit({ action: action || undefined, actorId: actorId || undefined, page });
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const options: Array<{ value: string; label: string }> = AUDIT_ACTION_PREFIXES.map((p) => ({
    value: p.value,
    label: p.label,
  }));
  if (action && !options.some((o) => o.value === action))
    options.push({ value: action, label: action });

  return (
    <div>
      <AdminPageHeader
        title="Audit log"
        description="Every privileged action, newest first. Metadata records what changed — never secrets."
      />
      <Toolbar>
        <FilterSelect
          id="filter-audit-action"
          label="Action"
          value={action}
          onValueChange={(v) => set({ action: v || null })}
          options={options}
          allLabel="All actions"
          className="sm:[&_button]:w-56"
        />
        {actorId ? (
          <div className="grid gap-1.5">
            <span className="text-xs text-muted">Actor</span>
            <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-secondary pl-4 pr-1 text-sm">
              <span className="max-w-56 truncate">{actorName || 'Selected account'}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear actor filter"
                onClick={() => set({ actor: null, actorName: null })}
              >
                <X aria-hidden="true" />
              </Button>
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted sm:pb-3">
            Tip: use the filter button on a row to see one person’s actions.
          </p>
        )}
      </Toolbar>

      <div className="mt-5 grid grid-cols-1 gap-4">
        {query.data ? (
          <ResultSummary
            total={query.data.total}
            page={query.data.page}
            pageSize={ADMIN_PAGE_SIZE}
            noun="entries"
          />
        ) : null}
        {query.isLoading ? (
          <TableSkeleton label="Loading the audit log" rows={8} />
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="The audit log didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={ScrollText}
            title={action || actorId ? 'No entries match these filters' : 'Nothing recorded yet'}
            description={
              action || actorId ? 'Try another action or clear the actor filter.' : undefined
            }
          />
        ) : (
          <>
            <TableFrame
              caption={`Audit log, page ${query.data.page} of ${query.data.totalPages}`}
              busy={query.isFetching && query.isPlaceholderData}
              minWidth={760}
            >
              <thead>
                <tr>
                  <Th className="w-32">When</Th>
                  <Th>What happened</Th>
                  <Th>Target</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((entry) => (
                  <AuditRow
                    key={entry.id}
                    entry={entry}
                    expanded={expanded.has(entry.id)}
                    onToggle={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      })
                    }
                    onFilterActor={(actor) =>
                      set({ actor: actor.id, actorName: actor.displayName })
                    }
                  />
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
    </div>
  );
}
