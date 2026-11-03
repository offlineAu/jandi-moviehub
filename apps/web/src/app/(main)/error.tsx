'use client';

import * as React from 'react';
import { ErrorState } from '@/components/ui/error-state';

export default function MainError({
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
    <div className="px-4 py-16 sm:px-6 lg:px-10">
      <ErrorState
        title="This page hit an unexpected error"
        error={new Error('Try again — if it keeps happening, head back home.')}
        onRetry={reset}
      />
    </div>
  );
}
