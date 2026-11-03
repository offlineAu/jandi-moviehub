import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminSettingsView } from '@/components/admin/settings-view';

export const metadata: Metadata = { title: 'Settings' };

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={null}>
      <AdminSettingsView />
    </Suspense>
  );
}
