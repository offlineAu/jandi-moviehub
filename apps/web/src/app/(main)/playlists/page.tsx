import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlaylistsView } from '@/components/playlists/playlists-view';

export const metadata: Metadata = { title: 'Playlists' };

export default function PlaylistsPage() {
  return (
    <Suspense fallback={null}>
      <PlaylistsView />
    </Suspense>
  );
}
