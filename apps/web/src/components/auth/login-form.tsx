'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@jandi/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { isApiError } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { useLogin, useOAuthProviders } from '@/lib/queries/auth';
import { cn, safeNextPath } from '@/lib/utils';
import { AuthCard } from './auth-card';
import { PasswordInput } from './password-input';
import { useRedirectIfSignedIn } from './use-redirect-if-signed-in';

type LoginInput = z.input<typeof loginSchema>;
type LoginOutput = z.output<typeof loginSchema>;

function OAuthButtons({ next }: { next: string }) {
  const providers = useOAuthProviders();
  const items = providers.data?.items ?? [];
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or continue with
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2">
        {items.map((p) => (
          <a
            key={p.id}
            href={`/api/v1/auth/oauth/${encodeURIComponent(p.id)}/start?returnTo=${encodeURIComponent(next)}`}
            className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
          >
            {p.id === 'google' ? (
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 48 48"
                className="size-5 shrink-0"
              >
                <path
                  fill="#4285F4"
                  d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5.1h6.6c3.9-3.6 6.1-8.8 6.1-14.8z"
                />
                <path
                  fill="#34A853"
                  d="M24 44c5.5 0 10.1-1.8 13.5-4.7l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8V33C9.2 39.5 16.1 44 24 44z"
                />
                <path
                  fill="#FBBC05"
                  d="M12.6 27.7c-.4-1.2-.6-2.4-.6-3.7s.2-2.5.6-3.7V15H5.8C4.6 17.7 4 20.8 4 24s.6 6.3 1.8 9l6.8-5.3z"
                />
                <path
                  fill="#EA4335"
                  d="M24 11.9c3 0 5.6 1 7.7 3l5.8-5.8C34.1 5.9 29.5 4 24 4 16.1 4 9.2 8.5 5.8 15l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4z"
                />
              </svg>
            ) : null}
            Continue with {p.name}
          </a>
        ))}
      </div>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'), '/');
  const oauthError = params.get('error');
  useRedirectIfSignedIn(next);
  const login = useLogin();
  const form = useForm<LoginInput, unknown, LoginOutput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: LoginOutput) => {
    try {
      const { user } = await login.mutateAsync(values);
      toast.success(`Welcome back, ${user.displayName}`);
      router.replace(next);
      router.refresh();
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        form.setError('root.server', {
          type: 'server',
          message: 'That email and password don’t match an account.',
        });
        form.setFocus('password');
        return;
      }
      applyApiErrors(error, form.setError, ['email', 'password']);
    }
  };

  return (
    <AuthCard
      title="Log in"
      description="Pick up where you left off, or jump back into a watch party."
      footer={
        <>
          New to Jandi?{' '}
          <Link
            href={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-medium link-fx focus-ring rounded tap-row"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
        <FormError
          message={
            errors.root?.server?.message ??
            (oauthError ? 'Social sign-in didn’t complete. Try again or use your email.' : null)
          }
        />
        <FormField label="Email" htmlFor="login-email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            {...form.register('email')}
          />
        </FormField>
        <FormField
          label="Password"
          htmlFor="login-password"
          error={errors.password?.message ? 'Enter your password' : undefined}
          aside={
            <Link
              href="/forgot-password"
              className="rounded text-xs font-medium link-fx focus-ring tap-row"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...form.register('password')} />
        </FormField>
        <Button
          type="submit"
          size="lg"
          className="mt-1 w-full"
          loading={isSubmitting}
          loadingText="Logging in"
        >
          Log in
        </Button>
      </form>
      <OAuthButtons next={next} />
    </AuthCard>
  );
}
