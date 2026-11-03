import type { Metadata } from 'next';
import { WatchView } from '@/components/watch/watch-view';

export const metadata: Metadata = { title: 'Watch' };

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchView id={id} />;
}
