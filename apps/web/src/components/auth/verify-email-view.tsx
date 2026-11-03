'use client';

import { CircleCheck, CircleX } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage } from '@/lib/api';
import { useMe, useResendVerification, useVerifyEmail } from '@/lib/queries/auth';
import { AuthCard } from './auth-card';

export function VerifyEmailView() {
  const token = useSearchParams().get('token') ?? '';
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const me = useMe();
  const attempted = React.useRef(false);
  const valid = token.length >= 20 && token.length <= 200;

  React.useEffect(() => {
    if (!valid || attempted.current) return;
    attempted.current = true;
    verify.mutate(token);
  }, [token, valid, verify]);

  const canResend = !!me.data && !me.data.isGuest && !me.data.emailVerified;

  if (valid && (verify.isPending || verify.isIdle)) {
    return (
      <AuthCard title="Confirming your email">
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner className="size-5" label="Confirming" />
          One moment…
        </div>
      </AuthCard>
    );
  }

  if (verify.isSuccess) {
    return (
      <AuthCard title="Email confirmed">
        <div className="flex gap-3" role="status">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <p className="text-sm text-foreground/85">
            Your email address is verified. You’re all set.
          </p>
        </div>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href="/">Start watching</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="This link didn’t work">
      <div className="flex gap-3" role="alert">
        <CircleX className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
        <p className="text-sm text-foreground/85">
          {valid
            ? errorMessage(verify.error, 'The verification link has expired or was already used.')
            : 'The verification link is incomplete.'}{' '}
          {canResend ? 'Send yourself a fresh link below.' : 'Log in to request a new link.'}
        </p>
      </div>
      {canResend ? (
        <Button
          size="lg"
          className="mt-6 w-full"
          loading={resend.isPending}
          loadingText="Sending"
          disabled={resend.isSuccess}
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: () => toast.success('Verification email sent'),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {resend.isSuccess ? 'Email sent — check your inbox' : 'Resend verification email'}
        </Button>
      ) : (
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href="/login?next=%2Fsettings">Log in</Link>
        </Button>
      )}
    </AuthCard>
  );
}
