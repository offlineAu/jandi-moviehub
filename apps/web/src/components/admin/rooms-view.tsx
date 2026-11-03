'use client';

import { ROOM_STATUSES } from '@jandi/shared';
import { Clapperboard, DoorClosed, ExternalLink, Lock, UserRound } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { ADMIN_PAGE_SIZE, useAdminRooms, useCloseRoom, type AdminRoom } from '@/lib/queries/admin';
import { formatRelative } from '@/lib/utils';
import { ActionDialog } from './action-dialog';
import { adminErrorMessage } from './admin-utils';
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
  UserCell,
  enumParam,
  tdClass,
  trClass,
  usePageParam,
  useSorted,
  useUrlSearch,
} from './admin-ui';

const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: 'Public',
  PRIVATE: 'Private',
  PASSWORD: 'Password',
  FRIENDS: 'Friends',
};

export function CloseRoomDialog({
  room,
  onClose,
}: {
  room: Pick<AdminRoom, 'id' | 'name' | 'code'> & { onlineCount?: number };
  onClose: () => void;
}) {
  const close = useCloseRoom();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      destructive
      title={`Close “${room.name}”?`}
      description={
        <>
          Everyone in room {room.code}
          {room.onlineCount ? ` (${room.onlineCount} online now)` : ''} is told the room was closed
          by a moderator, and nobody can rejoin. This can’t be undone.
        </>
      }
      confirmLabel="Close room"
      pendingLabel="Closing"
      pending={close.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        close.mutate(room.id, {
          onSuccess: () => {
            toast.success(`Closed “${room.name}”`);
            onClose();
          },
          onError: (e) => setError(adminErrorMessage(e)),
        });
      }}
    />
  );
}

export function RoomsView() {
  const { params, set } = useUrlState();
  const { q, text, setText } = useUrlSearch('q', 60);
  const { page, setPage } = usePageParam();
  const status = enumParam(params.get('status'), ROOM_STATUSES);
  const query = useAdminRooms({ q: q || undefined, status: status || undefined, page });
  const [closing, setClosing] = React.useState<AdminRoom | null>(null);
  const { sorted, sort, setSort } = useSorted(query.data?.items, {
    name: (r) => r.name,
    members: (r) => r.memberCount,
    online: (r) => r.onlineCount,
    messages: (r) => r.messageCount,
    active: (r) => (r.lastActiveAt ? Date.parse(r.lastActiveAt) : null),
  });

  return (
    <div>
      <AdminPageHeader
        title="Rooms"
        description="Every watch party, including private and password-protected ones."
      />
      <Toolbar>
        <SearchInput
          label="Search rooms by name, code or host username"
          placeholder="Name, code or host"
          value={text}
          onValueChange={setText}
          className="sm:w-80"
        />
        <FilterSelect
          id="filter-room-status"
          label="Status"
          value={status}
          onValueChange={(v) => set({ status: v || null })}
          options={[
            { value: 'OPEN', label: 'Open' },
            { value: 'CLOSED', label: 'Closed' },
          ]}
          allLabel="Open and closed"
        />
      </Toolbar>

      <div className="mt-5 grid grid-cols-1 gap-4">
        {query.data ? (
          <ResultSummary
            total={query.data.total}
            page={query.data.page}
            pageSize={ADMIN_PAGE_SIZE}
            noun="rooms"
          />
        ) : null}
        {query.isLoading ? (
          <TableSkeleton label="Loading rooms" />
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Rooms didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={Clapperboard}
            title={q || status ? 'No rooms match these filters' : 'No rooms yet'}
            description={
              q || status
                ? 'Try another search or status.'
                : 'Rooms appear here as soon as someone starts a watch party.'
            }
          />
        ) : (
          <>
            <TableFrame
              caption={`Rooms, page ${query.data.page} of ${query.data.totalPages}`}
              busy={query.isFetching && query.isPlaceholderData}
              minWidth={1020}
            >
              <thead>
                <tr>
                  <SortableTh label="Room" sortKey="name" sort={sort} onSort={setSort} />
                  <Th>Host</Th>
                  <Th>Movie</Th>
                  <Th>Visibility</Th>
                  <SortableTh label="Members" sortKey="members" sort={sort} onSort={setSort} />
                  <SortableTh label="Online" sortKey="online" sort={sort} onSort={setSort} />
                  <SortableTh label="Messages" sortKey="messages" sort={sort} onSort={setSort} />
                  <SortableTh label="Last active" sortKey="active" sort={sort} onSort={setSort} />
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className={trClass}>
                    <th scope="row" className={`${tdClass} max-w-60 font-normal`}>
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        {r.status === 'CLOSED' ? <Badge variant="outline">Closed</Badge> : null}
                      </span>
                      <span className="block font-display text-xs tracking-[0.14em] text-muted">
                        {r.code}
                      </span>
                    </th>
                    <td className={`${tdClass} max-w-48`}>
                      <UserCell user={r.host} size="xs" />
                    </td>
                    <td className={`${tdClass} max-w-44 truncate text-muted`}>
                      {r.movie?.title ?? '—'}
                    </td>
                    <td className={tdClass}>
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        {r.visibility !== 'PUBLIC' ? (
                          <Lock className="size-3.5" aria-hidden="true" />
                        ) : null}
                        {VISIBILITY_LABEL[r.visibility] ?? r.visibility}
                        {r.allowGuests ? (
                          <UserRound className="size-3.5" aria-label="Guests allowed" />
                        ) : null}
                      </span>
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      {r.memberCount}
                      <span className="text-subtle">/{r.maxMembers}</span>
                    </td>
                    <td className={`${tdClass} tabular-nums`}>{r.onlineCount}</td>
                    <td className={`${tdClass} tabular-nums`}>{r.messageCount}</td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>
                      {r.status === 'CLOSED' && r.closedAt
                        ? `Closed ${formatRelative(r.closedAt)}`
                        : r.lastActiveAt
                          ? formatRelative(r.lastActiveAt)
                          : '—'}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <span className="inline-flex items-center gap-1">
                        {r.status === 'OPEN' ? (
                          <>
                            <Button asChild variant="ghost" size="icon-sm">
                              <Link href={`/rooms/${r.code}`} aria-label={`Open room ${r.name}`}>
                                <ExternalLink aria-hidden="true" />
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setClosing(r)}
                              aria-label={`Close room ${r.name}`}
                            >
                              <DoorClosed aria-hidden="true" />
                              Close
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-subtle">Closed</span>
                        )}
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
      {closing ? (
        <CloseRoomDialog key={closing.id} room={closing} onClose={() => setClosing(null)} />
      ) : null}
    </div>
  );
}
