import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchView } from '@/components/browse/search-view';

export const metadata: Metadata = { title: 'Search' };

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}
