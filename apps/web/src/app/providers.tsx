'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import * as React from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isApiError } from '@/lib/api';
import { resolvePreferences, useMe } from '@/lib/queries/auth';
import { qk } from '@/lib/queries/keys';

function makeQueryClient() {
  // A 401 on any request means the session ended; reflect that in the cached user.
  const onAuthError = (error: unknown) => {
    if (
      isApiError(error) &&
      error.status === 401 &&
      error.code === 'UNAUTHENTICATED' &&
      client.getQueryData(qk.me)
    ) {
      client.setQueryData(qk.me, null);
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: onAuthError }),
    mutationCache: new MutationCache({ onError: onAuthError }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
  return client;
}

/** Applies the signed-in user's reduce-motion preference on top of the OS setting. */
function MotionPreferences({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const reduce = resolvePreferences(me.data).reduceMotion;
  React.useEffect(() => {
    if (reduce) document.documentElement.dataset.reduceMotion = 'true';
    else delete document.documentElement.dataset.reduceMotion;
  }, [reduce]);
  return <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>{children}</MotionConfig>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>
        <MotionPreferences>{children}</MotionPreferences>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
