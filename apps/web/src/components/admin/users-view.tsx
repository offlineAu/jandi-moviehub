'use client';

import { USER_ROLES, type UserRole } from '@jandi/shared';
import { Ban, MoreHorizontal, ShieldCheck, UserCheck, UserCog, Users } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ADMIN_PAGE_SIZE,
  useAdminUsers,
  useUpdateAdminUser,
  type AdminUser,
} from '@/lib/queries/admin';
import { formatDate, formatRelative } from '@/lib/utils';
import { ActionDialog } from './action-dialog';
import { useStaff } from './admin-shell';
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

const ROLE_LABEL: Record<UserRole, string> = {
  USER: 'User',
  MODERATOR: 'Moderator',
  ADMIN: 'Administrator',
};

function RoleBadge({ role }: { role: UserRole }) {
  if (role === 'ADMIN') return <Badge variant="primary">Admin</Badge>;
  if (role === 'MODERATOR') return <Badge variant="neutral">Moderator</Badge>;
  return <Badge variant="outline">User</Badge>;
}

type Pending = { kind: 'role'; user: AdminUser } | { kind: 'suspend'; user: AdminUser } | null;

function RoleDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const update = useUpdateAdminUser();
  const [role, setRole] = React.useState<UserRole>(user.role);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={`Change role for ${user.displayName}`}
      description={
        <>
          Moderators can review reports, close rooms and read the audit log. Administrators can do
          everything, including changing roles.
        </>
      }
      confirmLabel="Save role"
      pendingLabel="Saving"
      pending={update.isPending}
      confirmDisabled={role === user.role}
      error={error}
      onConfirm={() => {
        setError(null);
        update.mutate(
          { id: user.id, role },
          {
            onSuccess: () => {
              toast.success(`${user.displayName} is now ${ROLE_LABEL[role].toLowerCase()}`);
              onClose();
            },
            onError: (e) => setError(adminErrorMessage(e)),
          },
        );
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="user-role">Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
          <SelectTrigger id="user-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {USER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
                {r === user.role ? ' (current)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </ActionDialog>
  );
}

function SuspendDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const update = useUpdateAdminUser();
  const [error, setError] = React.useState<string | null>(null);
  const suspend = !user.suspended;
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={suspend ? `Suspend ${user.displayName}?` : `Lift suspension for ${user.displayName}?`}
      description={
        suspend
          ? 'They are signed out everywhere straight away and can’t sign in again until the suspension is lifted.'
          : 'They will be able to sign in again. Their old sessions are not restored.'
      }
      confirmLabel={suspend ? 'Suspend account' : 'Lift suspension'}
      pendingLabel={suspend ? 'Suspending' : 'Lifting'}
      destructive={suspend}
      pending={update.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        update.mutate(
          { id: user.id, suspended: suspend },
          {
            onSuccess: () => {
              toast.success(
                suspend
                  ? `${user.displayName} is suspended`
                  : `${user.displayName} can sign in again`,
              );
              onClose();
            },
            onError: (e) => setError(adminErrorMessage(e)),
          },
        );
      }}
    />
  );
}

function RowActions({
  user,
  isSelf,
  onAction,
}: {
  user: AdminUser;
  isSelf: boolean;
  onAction: (p: Pending) => void;
}) {
  if (isSelf) return <span className="text-xs text-subtle">That’s you</span>;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.displayName}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={user.isGuest} onSelect={() => onAction({ kind: 'role', user })}>
          <UserCog aria-hidden="true" />
          {user.isGuest ? 'Guests can’t have roles' : 'Change role…'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive={!user.suspended}
          onSelect={() => onAction({ kind: 'suspend', user })}
        >
          {user.suspended ? <UserCheck aria-hidden="true" /> : <Ban aria-hidden="true" />}
          {user.suspended ? 'Lift suspension…' : 'Suspend…'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UsersView() {
  const staff = useStaff();
  const { params, set } = useUrlState();
  const { q, text, setText } = useUrlSearch();
  const { page, setPage } = usePageParam();
  const role = enumParam(params.get('role'), USER_ROLES);
  const query = useAdminUsers({ q: q || undefined, role: role || undefined, page });
  const [pending, setPending] = React.useState<Pending>(null);
  const { sorted, sort, setSort } = useSorted(query.data?.items, {
    name: (u) => u.displayName,
    created: (u) => Date.parse(u.createdAt),
    seen: (u) => (u.lastSeenAt ? Date.parse(u.lastSeenAt) : null),
  });

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description="Find accounts, change platform roles and suspend abusive users."
      />
      <Toolbar>
        <SearchInput
          label="Search users by name, username or email"
          placeholder="Search name, username or email"
          value={text}
          onValueChange={setText}
          className="sm:w-80"
        />
        <FilterSelect
          id="filter-role"
          label="Role"
          value={role}
          onValueChange={(v) => set({ role: v || null })}
          options={USER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          allLabel="All roles"
        />
      </Toolbar>

      <div className="mt-5 grid grid-cols-1 gap-4">
        {query.data ? (
          <ResultSummary
            total={query.data.total}
            page={query.data.page}
            pageSize={ADMIN_PAGE_SIZE}
            noun="accounts"
          />
        ) : null}
        {query.isLoading ? (
          <TableSkeleton label="Loading users" />
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Users didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={Users}
            title={q || role ? 'No accounts match these filters' : 'No accounts yet'}
            description={q || role ? 'Try a different search or clear the role filter.' : undefined}
          />
        ) : (
          <>
            <TableFrame
              caption={`Accounts, page ${query.data.page} of ${query.data.totalPages}`}
              busy={query.isFetching && query.isPlaceholderData}
              minWidth={860}
            >
              <thead>
                <tr>
                  <SortableTh label="Account" sortKey="name" sort={sort} onSort={setSort} />
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <SortableTh label="Joined" sortKey="created" sort={sort} onSort={setSort} />
                  <SortableTh label="Last seen" sortKey="seen" sort={sort} onSort={setSort} />
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => (
                  <tr key={u.id} className={trClass}>
                    <th scope="row" className={`${tdClass} max-w-64 font-normal`}>
                      <UserCell user={u} />
                    </th>
                    <td className={`${tdClass} max-w-56`}>
                      {u.email ? (
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{u.email}</span>
                          {u.emailVerified ? (
                            <ShieldCheck
                              className="size-3.5 shrink-0 text-success"
                              aria-label="Email verified"
                            />
                          ) : (
                            <span className="sr-only">(not verified)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {u.isGuest ? (
                        <Badge variant="outline">Guest</Badge>
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                    </td>
                    <td className={tdClass}>
                      {u.suspended ? (
                        <Badge variant="danger">
                          <Ban aria-hidden="true" />
                          Suspended
                        </Badge>
                      ) : (
                        <span className="text-muted">Active</span>
                      )}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>
                      {formatDate(u.createdAt)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>
                      {u.lastSeenAt ? formatRelative(u.lastSeenAt) : 'Never'}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <RowActions user={u} isSelf={u.id === staff.id} onAction={setPending} />
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

      {pending?.kind === 'role' ? (
        <RoleDialog key={pending.user.id} user={pending.user} onClose={() => setPending(null)} />
      ) : null}
      {pending?.kind === 'suspend' ? (
        <SuspendDialog key={pending.user.id} user={pending.user} onClose={() => setPending(null)} />
      ) : null}
    </div>
  );
}
