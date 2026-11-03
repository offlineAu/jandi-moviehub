import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LicensesView } from '@/components/admin/licenses-view';

export const metadata: Metadata = { title: 'Licenses' };

export default function AdminLicensesPage() {
  return (
    <Suspense fallback={null}>
      <LicensesView />
    </Suspense>
  );
}
