'use client';

import { LogOut, Settings, Shield, User, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { errorMessage } from '@/lib/api';
import { useLogout } from '@/lib/queries/auth';
import type { Me } from '@/lib/types';

export function UserMenu({ me }: { me: Me }) {
  const router = useRouter();
  const logout = useLogout();
  const isStaff = me.role === 'ADMIN' || me.role === 'MODERATOR';

  const onLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success('Logged out');
        router.push('/');
        router.refresh();
      },
      onError: (error) => toast.error(errorMessage(error, 'Couldn’t log out. Try again.')),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-ring data-[state=open]:ring-2 data-[state=open]:ring-primary/60"
        aria-label={`Account menu for ${me.displayName}`}
      >
        <Avatar src={me.avatarUrl} name={me.displayName} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <Avatar src={me.avatarUrl} name={me.displayName} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {me.displayName}
            </span>
            <span className="block truncate text-xs text-muted">
              {me.isGuest ? 'Guest' : `@${me.username}`}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me.isGuest ? (
          <DropdownMenuItem asChild>
            <Link href="/register">
              <UserPlus aria-hidden="true" />
              Create an account
            </Link>
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/profile/${me.username}`}>
                <User aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings aria-hidden="true" />
                Settings
              </Link>
            </DropdownMenuItem>
            {isStaff ? (
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <Shield aria-hidden="true" />
                  Admin
                </Link>
              </DropdownMenuItem>
            ) : null}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} disabled={logout.isPending}>
          <LogOut aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
