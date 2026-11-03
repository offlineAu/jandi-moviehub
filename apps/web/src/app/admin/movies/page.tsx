import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MoviesView } from '@/components/admin/movies-view';

export const metadata: Metadata = { title: 'Movies' };

export default function AdminMoviesPage() {
  return (
    <Suspense fallback={null}>
      <MoviesView />
    </Suspense>
  );
}
