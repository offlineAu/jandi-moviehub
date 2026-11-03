import type { Metadata } from 'next';
import { AdminSeriesView } from '@/components/admin/series-view';
export const metadata: Metadata = { title: 'Series' };
export default function AdminSeriesPage() {
  return <AdminSeriesView />;
}
