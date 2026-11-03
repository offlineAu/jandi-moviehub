'use client';

import { RotateCw, TriangleAlert } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function ErrorState({
  title = 'This didn’t load',
  error,
  onRetry,
  retrying,
  className,
  compact,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-danger/20 bg-danger/[0.04] px-6 text-center',
        compact ? 'py-8' : 'py-14',
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-danger/25">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
      <div className="grid max-w-sm gap-1.5">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted">
          {errorMessage(error, 'Something went wrong while loading. Try again.')}
        </p>
      </div>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          loadingText="Retrying"
        >
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
