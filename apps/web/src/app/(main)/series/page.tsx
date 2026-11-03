import type { Metadata } from 'next';
import { SeriesBrowse } from '@/components/series/series-views';
export const metadata: Metadata = { title: 'Series & dramas' };
export default function SeriesPage() {
  return <SeriesBrowse />;
}
