'use client';

import type { RoomMemberPresence } from '@jandi/shared';
import {
  Crown,
  LogOut,
  MoreHorizontal,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
  UserX,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage } from '@/lib/api';
import { useMemberAction, type MemberAction, type RoomRole } from '@/lib/queries/rooms';
import { cn } from '@/lib/utils';

const ROLE_ORDER: Record<RoomRole, number> = { HOST: 0, COHOST: 1, MEMBER: 2 };

type Pending = {
  action: MemberAction;
  title: string;
  description: string;
  confirm: string;
  pending: string;
  done: string;
} | null;

export function PeoplePanel({
  roomId,
  members,
  myUserId,
  myRole,
  onInvite,
  onLeave,
  className,
}: {
  roomId: string;
  members: RoomMemberPresence[];
  myUserId: string | null;
  myRole: RoomRole | null;
  onInvite: () => void;
  onLeave: () => void;
  className?: string;
}) {
  const act = useMemberAction(roomId);
  const [pending, setPending] = React.useState<Pending>(null);
  const sorted = [...members].sort(
    (a, b) =>
      Number(b.online) - Number(a.online) ||
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.displayName.localeCompare(b.displayName),
  );
  const online = members.filter((m) => m.online).length;
  const isHost = myRole === 'HOST';
  const isCohost = myRole === 'COHOST';

  const run = (action: MemberAction, done: string) =>
    act.mutate(action, {
      onSuccess: () => {
        toast.success(done);
        setPending(null);
      },
      onError: (e) => toast.error(errorMessage(e, 'That didn’t work. Try again.')),
    });

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground">{online}</span> online of {members.length}
        </p>
        <Button size="sm" variant="secondary" onClick={onInvite}>
          <UserPlus aria-hidden="true" />
          Invite
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="People in this room">
        {sorted.map((m) => {
          const me = m.userId === myUserId;
          const canModerate = !me && (isHost || (isCohost && m.role === 'MEMBER'));
          return (
            <li
              key={m.userId}
              className={cn(
                'flex items-center gap-3 rounded-xl px-2 py-2',
                !m.online && 'opacity-55',
              )}
            >
              <span className="relative">
                <Avatar src={m.avatarUrl} name={m.displayName} size="md" />
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-surface',
                    m.online ? 'bg-success' : 'bg-subtle',
                  )}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{m.displayName}</span>
                  {me ? <span className="text-xs text-muted">(you)</span> : null}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="sr-only">{m.online ? 'Online' : 'Offline'}.</span>
                  {m.role === 'HOST' ? (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <Crown className="size-3" aria-hidden="true" />
                      Host
                    </span>
                  ) : m.role === 'COHOST' ? (
                    <span className="inline-flex items-center gap-1 text-[#d8b4fe]">
                      <Shield className="size-3" aria-hidden="true" />
                      Co-host
                    </span>
                  ) : (
                    <span>{m.isGuest ? 'Guest' : 'Member'}</span>
                  )}
                  {m.online && m.buffering ? (
                    <span className="inline-flex items-center gap-1">
                      <Spinner className="size-3" label="Buffering" />
                      Buffering
                    </span>
                  ) : m.online && m.driftMs !== null ? (
                    <span className={cn(Math.abs(m.driftMs) > 500 && 'text-warning')}>
                      {Math.abs(m.driftMs) < 150
                        ? 'In sync'
                        : `${m.driftMs > 0 ? '+' : '−'}${Math.abs(m.driftMs)} ms`}
                    </span>
                  ) : null}
                </p>
              </div>
              {canModerate ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    aria-label={`Actions for ${m.displayName}`}
                    className="grid size-8 place-items-center rounded-full text-muted hover:bg-glass-3 hover:text-foreground focus-ring"
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isHost && m.role === 'MEMBER' && !m.isGuest ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          run(
                            { kind: 'role', userId: m.userId, role: 'COHOST' },
                            `${m.displayName} is now a co-host`,
                          )
                        }
                      >
                        <Shield aria-hidden="true" />
                        Make co-host
                      </DropdownMenuItem>
                    ) : null}
                    {isHost && m.role === 'COHOST' ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          run(
                            { kind: 'role', userId: m.userId, role: 'MEMBER' },
                            `${m.displayName} is no longer a co-host`,
                          )
                        }
                      >
                        <ShieldOff aria-hidden="true" />
                        Remove co-host
                      </DropdownMenuItem>
                    ) : null}
                    {isHost && !m.isGuest ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          setPending({
                            action: { kind: 'transfer', userId: m.userId },
                            title: `Make ${m.displayName} the host?`,
                            description:
                              'They’ll control the room and its settings. You’ll become a co-host.',
                            confirm: 'Transfer host',
                            pending: 'Transferring',
                            done: `${m.displayName} is now the host`,
                          })
                        }
                      >
                        <Crown aria-hidden="true" />
                        Transfer host
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onSelect={() =>
                        setPending({
                          action: { kind: 'kick', userId: m.userId },
                          title: `Remove ${m.displayName}?`,
                          description:
                            'They’ll leave the room now but can join again if they have access.',
                          confirm: 'Remove',
                          pending: 'Removing',
                          done: `${m.displayName} was removed`,
                        })
                      }
                    >
                      <UserMinus aria-hidden="true" />
                      Remove from room
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      destructive
                      onSelect={() =>
                        setPending({
                          action: { kind: 'ban', userId: m.userId },
                          title: `Ban ${m.displayName}?`,
                          description: 'They’ll be removed and can’t rejoin this room.',
                          confirm: 'Ban',
                          pending: 'Banning',
                          done: `${m.displayName} was banned`,
                        })
                      }
                    >
                      <UserX aria-hidden="true" />
                      Ban from room
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          className="w-full text-muted hover:text-foreground"
          onClick={onLeave}
        >
          <LogOut aria-hidden="true" />
          Leave room
        </Button>
      </div>
      {pending ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirm}
          pendingLabel={pending.pending}
          pending={act.isPending}
          destructive={pending.action.kind !== 'transfer'}
          onConfirm={() => run(pending.action, pending.done)}
        />
      ) : null}
    </div>
  );
}
