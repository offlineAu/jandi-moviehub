'use client';

import { MailWarning, UserRound } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { useMe, useResendVerification } from '@/lib/queries/auth';

import type { Me } from '@/lib/types';

export function hasAccountBanner(me: Me | null | undefined): boolean {
  return !!me && (me.isGuest || !me.emailVerified);
}

/** Guest + unverified-email banners shown under the top nav. */
export function AccountBanners() {
  const me = useMe();
  const resend = useResendVerification();
  const user = me.data;
  if (!user) return null;

  if (user.isGuest) {
    return (
      <div
        role="region"
        aria-label="Guest account"
        className="border-b border-primary/20 bg-[linear-gradient(90deg,rgb(147_51_234/0.16),rgb(219_39_119/0.08))]"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6 lg:px-10">
          <UserRound className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            You’re watching as a guest. Create an account to keep a library, save progress and host
            your own watch parties.
          </p>
          <Button asChild size="sm">
            <Link href="/register">Create an account</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div
        role="region"
        aria-label="Email verification"
        className="border-b border-warning/20 bg-warning/[0.06]"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6 lg:px-10">
          <MailWarning className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            Confirm your email
            {user.email ? (
              <>
                {' '}
                (<span className="font-medium">{user.email}</span>)
              </>
            ) : null}{' '}
            to secure your account.
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={resend.isPending}
            loadingText="Sending"
            disabled={resend.isSuccess}
            onClick={() =>
              resend.mutate(undefined, {
                onSuccess: () =>
                  toast.success('Verification email sent', {
                    description: 'Check your inbox for the link.',
                  }),
                onError: (error) =>
                  toast.error(errorMessage(error, 'Couldn’t send the email. Try again.')),
              })
            }
          >
            {resend.isSuccess ? 'Email sent' : 'Resend email'}
          </Button>
        </div>
      </div>
    );
  }
  return null;
}
