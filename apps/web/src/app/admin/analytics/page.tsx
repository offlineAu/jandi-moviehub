import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AnalyticsView } from '@/components/admin/analytics-view';

export const metadata: Metadata = { title: 'Analytics' };

export default function AdminAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsView />
    </Suspense>
  );
}
