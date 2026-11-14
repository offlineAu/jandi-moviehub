import { Suspense } from 'react';
import { EmbedWatch } from '@/components/watch/embed-watch';
import { Spinner } from '@/components/ui/spinner';
export default function EmbedWatchPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-black" role="status" aria-label="Loading player">
          <Spinner className="size-8 text-white" label="Loading player" />
        </div>
      }
    >
      <EmbedWatch />
    </Suspense>
  );
}
