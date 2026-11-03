'use client';

import {
  preferencesSchema,
  type LoginInput,
  type Preferences,
  type RegisterInput,
} from '@jandi/shared';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { apiFetch, isApiError } from '../api';
import { resetSocket } from '../sync/socket';
import type { ItemList, Me, OAuthProvider, SessionInfo } from '../types';
import { qk } from './keys';

export async function fetchMe(): Promise<Me | null> {
  try {
    const { user } = await apiFetch<{ user: Me }>('/auth/me');
    return user;
  } catch (error) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }
}

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards — keeps auth-dependent markup hydration-safe. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function useMe(): UseQueryResult<Me | null> {
  const query = useQuery({ queryKey: qk.me, queryFn: fetchMe, staleTime: 5 * 60_000 });
  const hydrated = useHydrated();
  if (!hydrated) {
    // The server never knows the session; render the "checking" state until hydration completes.
    return {
      ...query,
      data: undefined,
      isLoading: true,
      isPending: true,
      isSuccess: false,
      isError: false,
      status: 'pending',
    } as UseQueryResult<Me | null>;
  }
  return query;
}

export function resolvePreferences(me: Me | null | undefined): Preferences {
  const parsed = preferencesSchema.safeParse(me?.preferences ?? {});
  return parsed.success ? parsed.data : preferencesSchema.parse({});
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch<{ user: Me }>('/auth/login', { method: 'POST', body: input }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(qk.me, user);
      resetSocket();
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiFetch<{ user: Me }>('/auth/register', { method: 'POST', body: input }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(qk.me, user);
      resetSocket();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(qk.me, null);
      resetSocket();
    },
  });
}

/** Creates a short-lived guest session (used to join rooms that allow guests). */
export function useGuestSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      apiFetch<{ user: Me }>('/auth/guest', { method: 'POST', body: { displayName } }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(qk.me, user);
      resetSocket();
    },
  });
}

export function useOAuthProviders() {
  return useQuery({
    queryKey: qk.oauthProviders,
    queryFn: () => apiFetch<ItemList<OAuthProvider>>('/auth/oauth/providers'),
    staleTime: 30 * 60_000,
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<void>('/auth/verify-email', { method: 'POST', body: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/verify-email/resend', { method: 'POST' }),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<void>('/auth/password-reset/request', { method: 'POST', body: { email } }),
  });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      apiFetch<void>('/auth/password-reset/confirm', { method: 'POST', body: input }),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<void>('/auth/password', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}

export function useSessions(enabled = true) {
  return useQuery({
    queryKey: qk.sessions,
    queryFn: () => apiFetch<ItemList<SessionInfo>>('/auth/sessions'),
    enabled,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}
