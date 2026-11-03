import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MediaView } from '@/components/admin/media-view';

export const metadata: Metadata = { title: 'Media assets' };

export default function AdminMediaPage() {
  return (
    <Suspense fallback={null}>
      <MediaView />
    </Suspense>
  );
}
