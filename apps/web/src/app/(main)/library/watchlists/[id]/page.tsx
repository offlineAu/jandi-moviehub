import type { Metadata } from 'next';
import { WatchlistDetailView } from '@/components/library/watchlist-detail-view';

export const metadata: Metadata = { title: 'Watchlist' };

export default async function WatchlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchlistDetailView id={id} />;
}
