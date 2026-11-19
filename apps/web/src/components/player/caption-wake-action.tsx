'use client';

import * as React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export type CaptionWakeResult = 'found' | 'missing' | 'unavailable';

export function CaptionWakeAction({ onWake }: { onWake: () => Promise<CaptionWakeResult> }) {
  const [status, setStatus] = React.useState<'idle' | 'checking' | CaptionWakeResult>('idle');
  const run = async () => {
    if (status === 'checking') return;
    setStatus('checking');
    try {
      setStatus(await onWake());
    } catch {
      setStatus('unavailable');
    }
  };
  return (
    <>
      <DropdownMenuItem
        disabled={status === 'checking'}
        onSelect={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        {status === 'checking' ? 'Waking resolver…' : 'Wake resolver and check captions'}
      </DropdownMenuItem>
      <p
        role="status"
        aria-live="polite"
        className="px-2.5 pb-2 text-xs leading-relaxed text-muted"
      >
        {status === 'checking'
          ? 'This may take up to a minute.'
          : status === 'missing'
            ? 'Resolver is awake, but no captions were returned. Try again later.'
            : status === 'unavailable'
              ? 'Couldn’t reach the resolver. Try again shortly.'
              : status === 'found'
                ? 'Captions are ready.'
                : ''}
      </p>
    </>
  );
}
