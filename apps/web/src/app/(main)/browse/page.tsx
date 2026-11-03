import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BrowseView } from '@/components/browse/browse-view';
import { MovieGridSkeleton } from '@/components/movies/movie-grid';

export const metadata: Metadata = { title: 'Browse' };

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-8 sm:px-6 lg:px-10">
          <MovieGridSkeleton />
        </div>
      }
    >
      <BrowseView />
    </Suspense>
  );
}
