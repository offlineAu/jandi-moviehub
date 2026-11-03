'use client';

import { LockKeyhole, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Spinner } from '@/components/ui/spinner';
import { useMe } from '@/lib/queries/auth';
import type { Me } from '@/lib/types';

/**
 * Client-side guard for account-only pages. The proxy already redirects visitors without a session
 * cookie; this handles expired sessions (401) and guests, who can't use account features.
 */
export function RequireAccount({
  children,
  feature,
}: {
  children: (me: Me) => React.ReactNode;
  feature: string;
}) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (me.isSuccess && me.data === null) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
    }
  }, [me.isSuccess, me.data, pathname, router]);

  if (me.isLoading || (me.isSuccess && me.data === null)) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-muted">
        <Spinner className="size-6" label="Checking your session" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        <ErrorState
          title="We couldn’t check your session"
          error={me.error}
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        />
      </div>
    );
  }
  const user = me.data!;
  if (user.isGuest) {
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        <EmptyState
          icon={LockKeyhole}
          title={`${feature} needs an account`}
          description="Guest access covers joining watch parties. Create a free account to save titles, track progress and manage your profile."
          action={
            <Button asChild>
              <Link href="/register">
                <UserPlus aria-hidden="true" />
                Create an account
              </Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <>{children(user)}</>;
}
