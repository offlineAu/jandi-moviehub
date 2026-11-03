'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@jandi/shared';
import { Laptop, Smartphone } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordInput } from '@/components/auth/password-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FormError, FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, isApiError } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { useChangePassword, useRevokeSession, useSessions } from '@/lib/queries/auth';
import type { SessionInfo } from '@/lib/types';
import { formatRelative } from '@/lib/utils';
import { SettingsSection } from './section';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: 'Passwords don’t match',
    path: ['confirm'],
  });
type Values = z.infer<typeof schema>;

function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Unknown device', mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /curl|node|undici/i.test(ua)
            ? 'API client'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) && !/iPhone|iPad/.test(ua)
      ? 'macOS'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return { label: os ? `${browser} on ${os}` : browser, mobile };
}

function ChangePassword() {
  const change = useChangePassword();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      noValidate
      className="grid max-w-md gap-5"
      onSubmit={form.handleSubmit(async ({ currentPassword, newPassword }) => {
        try {
          await change.mutateAsync({ currentPassword, newPassword });
          form.reset();
          toast.success('Password changed', {
            description: 'Other devices may need to log in again.',
          });
        } catch (error) {
          if (
            isApiError(error) &&
            (error.status === 401 || error.status === 403) &&
            error.code !== 'UNAUTHENTICATED'
          ) {
            form.setError('currentPassword', { type: 'server', message: error.message });
            return;
          }
          if (isApiError(error) && error.code === 'INVALID_PASSWORD') {
            form.setError('currentPassword', {
              type: 'server',
              message: 'Your current password is incorrect',
            });
            return;
          }
          applyApiErrors(error, form.setError, ['currentPassword', 'newPassword']);
        }
      })}
    >
      <FormError message={errors.root?.server?.message} />
      <FormField
        label="Current password"
        htmlFor="current-password"
        error={errors.currentPassword?.message}
      >
        <PasswordInput autoComplete="current-password" {...form.register('currentPassword')} />
      </FormField>
      <FormField
        label="New password"
        htmlFor="new-password"
        error={errors.newPassword?.message}
        hint="At least 10 characters."
      >
        <PasswordInput autoComplete="new-password" {...form.register('newPassword')} />
      </FormField>
      <FormField
        label="Confirm new password"
        htmlFor="confirm-password"
        error={errors.confirm?.message}
      >
        <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
      </FormField>
      <div>
        <Button type="submit" loading={isSubmitting} loadingText="Updating">
          Change password
        </Button>
      </div>
    </form>
  );
}

function SessionRow({ session }: { session: SessionInfo }) {
  const revoke = useRevokeSession();
  const agent = describeAgent(session.userAgent);
  const Icon = agent.mobile ? Smartphone : Laptop;
  return (
    <li className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.05] text-muted ring-1 ring-white/10">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {agent.label}
          {session.current ? <Badge variant="primary">This device</Badge> : null}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {session.ip ? `${session.ip}, ` : ''}active {formatRelative(session.lastUsedAt)}, signed
          in {formatRelative(session.createdAt)}
        </p>
      </div>
      {session.current ? null : (
        <Button
          variant="outline"
          size="sm"
          loading={revoke.isPending}
          loadingText="Signing out"
          onClick={() =>
            revoke.mutate(session.id, {
              onSuccess: () => toast.success('Session signed out'),
              onError: (e) =>
                toast.error(errorMessage(e, 'Couldn’t sign out that session. Try again.')),
            })
          }
        >
          Sign out
        </Button>
      )}
    </li>
  );
}

function Sessions() {
  const sessions = useSessions();
  if (sessions.isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }
  if (sessions.isError)
    return (
      <ErrorState
        compact
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        retrying={sessions.isFetching}
      />
    );
  const items = [...(sessions.data?.items ?? [])].sort(
    (a, b) => Number(b.current) - Number(a.current),
  );
  return (
    <ul className="divide-y divide-border">
      {items.map((s) => (
        <SessionRow key={s.id} session={s} />
      ))}
    </ul>
  );
}

export function SecurityTab() {
  return (
    <div className="grid gap-6">
      <SettingsSection title="Password">
        <ChangePassword />
      </SettingsSection>
      <SettingsSection
        title="Active sessions"
        description="Devices currently signed in to your account. Sign out any you don’t recognize."
      >
        <Sessions />
      </SettingsSection>
    </div>
  );
}
