import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoomsView } from '@/components/admin/rooms-view';

export const metadata: Metadata = { title: 'Rooms' };

export default function AdminRoomsPage() {
  return (
    <Suspense fallback={null}>
      <RoomsView />
    </Suspense>
  );
}
