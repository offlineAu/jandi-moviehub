import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmailView } from '@/components/auth/verify-email-view';

export const metadata: Metadata = { title: 'Verify your email' };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailView />
    </Suspense>
  );
}
