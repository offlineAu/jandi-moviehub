import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateRoomView } from '@/components/rooms/create-room-form';

export const metadata: Metadata = { title: 'Start a watch party' };

export default function NewRoomPage() {
  return (
    <Suspense fallback={null}>
      <CreateRoomView />
    </Suspense>
  );
}
