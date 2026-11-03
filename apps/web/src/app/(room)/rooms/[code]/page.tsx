import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoomEntry } from '@/components/rooms/room-entry';

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: `Room ${decodeURIComponent(code).toUpperCase()}` };
}

export default async function RoomPage({ params }: Props) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <RoomEntry code={decodeURIComponent(code).toUpperCase()} />
    </Suspense>
  );
}
