import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoomsDiscovery } from '@/components/rooms/rooms-discovery';

export const metadata: Metadata = { title: 'Watch parties' };

export default function RoomsPage() {
  return (
    <Suspense fallback={null}>
      <RoomsDiscovery />
    </Suspense>
  );
}
