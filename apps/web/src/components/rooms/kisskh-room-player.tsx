'use client';

import * as React from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The embed controls remain local; changing the episode is the shared room action. */
export function KisskhRoomPlayer({
  src,
  title,
  overlay,
}: {
  src: string;
  title: string;
  overlay?: React.ReactNode;
}) {
  const [attempt, setAttempt] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  return (
    <section aria-label={`KissKH room player: ${title}`}>
      <div className="relative aspect-video bg-black">
        <iframe
          key={`${src}-${attempt}`}
          src={src}
          title={`${title} KissKH player`}
          className="size-full"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFailed(true)}
        />
        <div className="pointer-events-none absolute inset-0">{overlay}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
        <p>
          The host chooses the episode for everyone. Play, pause and seeking are controlled
          individually.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          <RotateCw aria-hidden="true" />
          Reload my player
        </Button>
      </div>
      {failed && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          The KissKH player could not load. Reload it or ask the host to choose another source.
        </p>
      )}
    </section>
  );
}
