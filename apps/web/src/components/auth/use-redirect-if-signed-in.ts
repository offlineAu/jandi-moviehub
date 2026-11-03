'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useMe } from '@/lib/queries/auth';

/** Signed-in (non-guest) users don't need the login/register forms. */
export function useRedirectIfSignedIn(next: string) {
  const me = useMe();
  const router = useRouter();
  const signedIn = !!me.data && !me.data.isGuest;
  React.useEffect(() => {
    if (signedIn) router.replace(next);
  }, [signedIn, next, router]);
  return signedIn;
}
