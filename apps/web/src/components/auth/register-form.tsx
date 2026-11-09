'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@jandi/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { isApiError } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { useRegister } from '@/lib/queries/auth';
import { safeNextPath } from '@/lib/utils';
import { AuthCard } from './auth-card';
import { PasswordInput } from './password-input';
import { useRedirectIfSignedIn } from './use-redirect-if-signed-in';

type RegisterInput = z.input<typeof registerSchema>;
type RegisterOutput = z.output<typeof registerSchema>;

const FIELDS = ['email', 'username', 'displayName', 'password'] as const;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'), '/');
  useRedirectIfSignedIn(next);
  const register = useRegister();
  const form = useForm<RegisterInput, unknown, RegisterOutput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', username: '', displayName: '', password: '' },
    mode: 'onTouched',
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: RegisterOutput) => {
    try {
      const { user, verificationEmailSent } = await register.mutateAsync(values);
      toast.success(`Welcome to Jandi, ${user.displayName}`, {
        description: !user.email
          ? undefined
          : verificationEmailSent === false
            ? 'Your account is ready, but we couldn’t send the confirmation email. Use “Resend email” in the banner to try again.'
            : `We sent a confirmation link to ${user.email}.`,
      });
      router.replace(next);
      router.refresh();
    } catch (error) {
      if (isApiError(error)) {
        if (error.code === 'EMAIL_TAKEN') {
          form.setError('email', { type: 'server', message: error.message });
          return;
        }
        if (error.code === 'USERNAME_TAKEN') {
          form.setError('username', { type: 'server', message: error.message });
          return;
        }
      }
      applyApiErrors(error, form.setError, FIELDS);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      description="Host watch parties, keep a watchlist and resume any movie where you stopped."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="rounded font-medium link-fx focus-ring"
          >
            Log in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
        <FormError message={errors.root?.server?.message} />
        <FormField label="Email" htmlFor="register-email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            {...form.register('email')}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Display name"
            htmlFor="register-display-name"
            error={errors.displayName?.message ? 'Enter a name up to 40 characters' : undefined}
          >
            <Input autoComplete="nickname" maxLength={40} {...form.register('displayName')} />
          </FormField>
          <FormField
            label="Username"
            htmlFor="register-username"
            error={errors.username?.message}
            hint="Lowercase letters, numbers, _"
          >
            <Input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={24}
              {...form.register('username')}
            />
          </FormField>
        </div>
        <FormField
          label="Password"
          htmlFor="register-password"
          error={errors.password?.message}
          hint="At least 10 characters."
        >
          <PasswordInput autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <Button
          type="submit"
          size="lg"
          className="mt-1 w-full"
          loading={isSubmitting}
          loadingText="Creating account"
        >
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
