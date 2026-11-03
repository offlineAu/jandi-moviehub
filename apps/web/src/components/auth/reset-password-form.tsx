'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@jandi/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, FormField } from '@/components/ui/form-field';
import { isApiError } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { useConfirmPasswordReset } from '@/lib/queries/auth';
import { AuthCard } from './auth-card';
import { PasswordInput } from './password-input';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] });
type Values = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const confirm = useConfirmPasswordReset();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const tokenLooksValid = token.length >= 20 && token.length <= 200;

  if (!tokenLooksValid) {
    return (
      <AuthCard
        title="This reset link isn’t valid"
        description="The link is incomplete or has expired. Request a new one to continue."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="After saving, you’ll be signed out everywhere and can log in with the new password."
    >
      <form
        noValidate
        className="grid gap-5"
        onSubmit={form.handleSubmit(async ({ password }) => {
          try {
            await confirm.mutateAsync({ token, password });
            toast.success('Password updated', { description: 'Log in with your new password.' });
            router.replace('/login');
          } catch (error) {
            if (isApiError(error) && error.status === 400 && error.code !== 'VALIDATION_FAILED') {
              form.setError('root.server', {
                type: 'server',
                message: 'This reset link has expired or was already used. Request a new one.',
              });
              return;
            }
            applyApiErrors(error, form.setError, ['password']);
          }
        })}
      >
        <FormError message={errors.root?.server?.message} />
        <FormField
          label="New password"
          htmlFor="reset-password"
          error={errors.password?.message}
          hint="At least 10 characters."
        >
          <PasswordInput autoComplete="new-password" autoFocus {...form.register('password')} />
        </FormField>
        <FormField
          label="Confirm new password"
          htmlFor="reset-confirm"
          error={errors.confirm?.message}
        >
          <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
        </FormField>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={isSubmitting}
          loadingText="Saving"
        >
          Save new password
        </Button>
        {errors.root?.server ? (
          <Link href="/forgot-password" className="text-center text-sm font-medium link-fx">
            Request a new link
          </Link>
        ) : null}
      </form>
    </AuthCard>
  );
}
