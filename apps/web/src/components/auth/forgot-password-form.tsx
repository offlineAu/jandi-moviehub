'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordResetRequestSchema } from '@jandi/shared';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { applyApiErrors } from '@/lib/form-errors';
import { useRequestPasswordReset } from '@/lib/queries/auth';
import { AuthCard } from './auth-card';

type In = z.input<typeof passwordResetRequestSchema>;
type Out = z.output<typeof passwordResetRequestSchema>;

export function ForgotPasswordForm() {
  const request = useRequestPasswordReset();
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        footer={
          <Link href="/login" className="rounded font-medium link-fx focus-ring">
            Back to log in
          </Link>
        }
      >
        <div className="flex gap-3" role="status">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-foreground/85">
            If an account exists for <span className="font-medium">{sentTo}</span>, a link to reset
            your password is on its way. It expires soon, so use it in the next hour.
          </p>
        </div>
        <Button variant="ghost" className="mt-5" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we’ll send you a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="rounded font-medium link-fx focus-ring">
            Log in
          </Link>
        </>
      }
    >
      <form
        noValidate
        className="grid gap-5"
        onSubmit={form.handleSubmit(async ({ email }) => {
          try {
            await request.mutateAsync(email);
            setSentTo(email);
          } catch (error) {
            applyApiErrors(error, form.setError, ['email']);
          }
        })}
      >
        <FormError message={errors.root?.server?.message} />
        <FormField label="Email" htmlFor="forgot-email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            {...form.register('email')}
          />
        </FormField>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={isSubmitting}
          loadingText="Sending link"
        >
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
