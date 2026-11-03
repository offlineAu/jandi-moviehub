import type { Metadata } from 'next';
import { SourcesView } from '@/components/admin/sources-view';
export const metadata: Metadata = { title: 'Find source videos' };
export default function SourcesPage() {
  return <SourcesView />;
}
