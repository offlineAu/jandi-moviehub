'use client';

import { House, RotateCw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-4 py-16">
      <div className="grid max-w-md justify-items-center gap-4 text-center" role="alert">
        <h1 className="font-display text-3xl font-semibold">Something broke on our side</h1>
        <p className="text-muted">
          This page hit an unexpected error. Try again — if it keeps happening, head back home.
          {error.digest ? (
            <span className="mt-2 block text-xs text-subtle">Reference: {error.digest}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">
              <House aria-hidden="true" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
