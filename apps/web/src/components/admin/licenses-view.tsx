'use client';

import { LICENSE_TYPES } from '@jandi/shared';
import {
  BadgeCheck,
  CalendarClock,
  CalendarX2,
  ExternalLink,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import {
  ADMIN_PAGE_SIZE,
  useAdminLicenses,
  useSetLicenseVerified,
  type AdminLicense,
} from '@/lib/queries/admin';
import { formatDate } from '@/lib/utils';
import { ActionDialog } from './action-dialog';
import {
  adminErrorMessage,
  formatDateTime,
  LICENSE_TYPE_LABELS,
  licenseStatus,
} from './admin-utils';
import {
  AdminPageHeader,
  AdminQueryError,
  FilterSelect,
  ResultSummary,
  SortableTh,
  TableFrame,
  TableSkeleton,
  Th,
  Toolbar,
  enumParam,
  tdClass,
  trClass,
  usePageParam,
  useSorted,
  useUrlSearch,
} from './admin-ui';
import { LicenseFormDialog } from './license-form-dialog';

/** Verified / unverified plus the validity window state — icon + label, never color alone. */
export function LicenseStatusBadges({
  license,
}: {
  license: Pick<AdminLicense, 'verified' | 'usable' | 'validFrom' | 'validUntil'>;
}) {
  const status = licenseStatus(license);
  return (
    <span className="flex flex-wrap gap-1">
      {status.verified ? (
        <Badge variant="playable">
          <BadgeCheck aria-hidden="true" />
          Verified
        </Badge>
      ) : (
        <Badge variant="outline">
          <ShieldQuestion aria-hidden="true" />
          Unverified
        </Badge>
      )}
      {status.window === 'expired' ? (
        <Badge variant="danger">
          <CalendarX2 aria-hidden="true" />
          Expired
        </Badge>
      ) : status.window === 'pending' ? (
        <Badge variant="demo">
          <CalendarClock aria-hidden="true" />
          Not yet valid
        </Badge>
      ) : null}
    </span>
  );
}

function windowText(l: AdminLicense) {
  if (!l.validFrom && !l.validUntil) return 'No time limit';
  return `${l.validFrom ? formatDate(l.validFrom) : 'Any time'} → ${l.validUntil ? formatDate(l.validUntil) : 'open-ended'}`;
}

function VerifyDialog({ license, onClose }: { license: AdminLicense; onClose: () => void }) {
  const mutation = useSetLicenseVerified();
  const [error, setError] = React.useState<string | null>(null);
  const verify = !license.verified;
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      destructive={!verify}
      title={verify ? `Verify “${license.title}”?` : `Remove verification from “${license.title}”?`}
      description={
        verify ? (
          <>
            Confirm you have checked the provenance
            {license.provenanceUrl ? ' link' : ''} and that {license.licensor} grants these rights
            for{' '}
            {license.territory.toLowerCase() === 'worldwide'
              ? 'every territory'
              : license.territory}
            . Approved assets under this license become playable while it is in its validity window.
          </>
        ) : (
          <>
            {license.assetCount
              ? `${license.assetCount} media asset${license.assetCount === 1 ? '' : 's'} use this license. Approved ones stop being playable straight away.`
              : 'No media assets use this license yet.'}
          </>
        )
      }
      confirmLabel={verify ? 'Verify license' : 'Remove verification'}
      pendingLabel={verify ? 'Verifying' : 'Removing'}
      pending={mutation.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        mutation.mutate(
          { id: license.id, verified: verify },
          {
            onSuccess: ({ license: saved }) => {
              toast.success(
                verify
                  ? saved.usable
                    ? `“${saved.title}” is verified`
                    : `“${saved.title}” is verified, but it is outside its validity window`
                  : `Verification removed from “${saved.title}”`,
              );
              onClose();
            },
            onError: (e) => setError(adminErrorMessage(e)),
          },
        );
      }}
    >
      {verify && license.provenanceUrl ? (
        <a
          href={license.provenanceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 justify-self-start rounded-sm text-sm link-fx focus-ring"
        >
          Open provenance
          <ExternalLink className="size-3.5" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </ActionDialog>
  );
}

export function LicensesView() {
  const { params, set } = useUrlState();
  const { q, text, setText } = useUrlSearch();
  const { page, setPage } = usePageParam();
  const type = enumParam(params.get('type'), LICENSE_TYPES);
  const verifiedParam = enumParam(params.get('verified'), ['true', 'false'] as const);
  const query = useAdminLicenses({
    q: q || undefined,
    type: type || undefined,
    verified: verifiedParam ? verifiedParam === 'true' : undefined,
    page,
  });
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminLicense | null>(null);
  const [verifying, setVerifying] = React.useState<AdminLicense | null>(null);
  const { sorted, sort, setSort } = useSorted(query.data?.items, {
    title: (l) => l.title,
    licensor: (l) => l.licensor,
    assets: (l) => l.assetCount,
    until: (l) => (l.validUntil ? Date.parse(l.validUntil) : null),
  });
  const filtered = !!(q || type || verifiedParam);

  return (
    <div>
      <AdminPageHeader
        title="Licenses"
        description="Rights records behind every playable asset. Only verified licenses inside their validity window allow playback."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            New license
          </Button>
        }
      />
      <Toolbar>
        <SearchInput
          label="Search licenses by title or licensor"
          placeholder="Search title or licensor"
          value={text}
          onValueChange={setText}
          className="sm:w-80"
        />
        <FilterSelect
          id="filter-license-type"
          label="Type"
          value={type}
          onValueChange={(v) => set({ type: v || null })}
          options={LICENSE_TYPES.map((t) => ({ value: t, label: LICENSE_TYPE_LABELS[t] ?? t }))}
          allLabel="All types"
        />
        <FilterSelect
          id="filter-verified"
          label="Verification"
          value={verifiedParam}
          onValueChange={(v) => set({ verified: v || null })}
          options={[
            { value: 'true', label: 'Verified' },
            { value: 'false', label: 'Unverified' },
          ]}
          allLabel="Any"
        />
      </Toolbar>

      <div className="mt-5 grid grid-cols-1 gap-4">
        {query.data ? (
          <ResultSummary
            total={query.data.total}
            page={query.data.page}
            pageSize={ADMIN_PAGE_SIZE}
            noun="licenses"
          />
        ) : null}
        {query.isLoading ? (
          <TableSkeleton label="Loading licenses" />
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Licenses didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={ShieldCheck}
            title={filtered ? 'No licenses match these filters' : 'No licenses yet'}
            description={
              filtered
                ? 'Try a different search or clear the filters.'
                : 'Create a license before registering media for a title.'
            }
          />
        ) : (
          <>
            <TableFrame
              caption={`Licenses, page ${query.data.page} of ${query.data.totalPages}`}
              busy={query.isFetching && query.isPlaceholderData}
              minWidth={980}
            >
              <thead>
                <tr>
                  <SortableTh label="License" sortKey="title" sort={sort} onSort={setSort} />
                  <Th>Type</Th>
                  <SortableTh label="Licensor" sortKey="licensor" sort={sort} onSort={setSort} />
                  <SortableTh label="Validity" sortKey="until" sort={sort} onSort={setSort} />
                  <Th>Status</Th>
                  <SortableTh label="Assets" sortKey="assets" sort={sort} onSort={setSort} />
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr key={l.id} className={trClass}>
                    <th scope="row" className={`${tdClass} max-w-72 font-normal`}>
                      <span className="block truncate font-medium">{l.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {l.territory}
                        {l.verifiedAt
                          ? ` · verified ${formatDateTime(l.verifiedAt)}${l.verifiedBy ? ` by @${l.verifiedBy.username}` : ''}`
                          : ''}
                      </span>
                    </th>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {LICENSE_TYPE_LABELS[l.type] ?? l.type}
                    </td>
                    <td className={`${tdClass} max-w-48 truncate text-muted`}>{l.licensor}</td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>{windowText(l)}</td>
                    <td className={tdClass}>
                      <LicenseStatusBadges license={l} />
                    </td>
                    <td className={`${tdClass} tabular-nums`}>{l.assetCount}</td>
                    <td className={`${tdClass} text-right`}>
                      <span className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(l)}
                          aria-label={`Edit ${l.title}`}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant={l.verified ? 'ghost' : 'outline'}
                          size="sm"
                          onClick={() => setVerifying(l)}
                          aria-label={`${l.verified ? 'Remove verification from' : 'Verify'} ${l.title}`}
                        >
                          {l.verified ? (
                            <ShieldOff aria-hidden="true" />
                          ) : (
                            <BadgeCheck aria-hidden="true" />
                          )}
                          {l.verified ? 'Unverify' : 'Verify'}
                        </Button>
                      </span>
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

      <LicenseFormDialog open={creating} onOpenChange={setCreating} />
      <LicenseFormDialog
        open={!!editing}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
        license={editing ?? undefined}
      />
      {verifying ? (
        <VerifyDialog key={verifying.id} license={verifying} onClose={() => setVerifying(null)} />
      ) : null}
    </div>
  );
}
