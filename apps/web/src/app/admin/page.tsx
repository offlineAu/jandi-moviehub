import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OverviewView } from '@/components/admin/overview-view';

export const metadata: Metadata = { title: 'Admin overview' };

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={null}>
      <OverviewView />
    </Suspense>
  );
}
