import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NotificationsView } from '@/components/notifications/notifications-view';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsView />
    </Suspense>
  );
}
