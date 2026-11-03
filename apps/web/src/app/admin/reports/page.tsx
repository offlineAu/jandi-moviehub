import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportsView } from '@/components/admin/reports-view';

export const metadata: Metadata = { title: 'Reports' };

export default function AdminReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsView />
    </Suspense>
  );
}
