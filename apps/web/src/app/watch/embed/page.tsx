import { Suspense } from 'react';
import { EmbedWatch } from '@/components/watch/embed-watch';
export default function EmbedWatchPage() {
  return (
    <Suspense fallback={<p>Loading player…</p>}>
      <EmbedWatch />
    </Suspense>
  );
}
