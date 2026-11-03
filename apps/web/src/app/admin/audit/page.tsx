import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditView } from '@/components/admin/audit-view';

export const metadata: Metadata = { title: 'Audit log' };

export default function AdminAuditPage() {
  return (
    <Suspense fallback={null}>
      <AuditView />
    </Suspense>
  );
}
