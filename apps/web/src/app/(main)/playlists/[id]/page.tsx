import type { Metadata } from 'next';
import { PlaylistDetailView } from '@/components/playlists/playlist-detail-view';

export const metadata: Metadata = { title: 'Playlist' };

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaylistDetailView id={id} />;
}
