'use client';

import type { UpdateProfileInput } from '@jandi/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type { Me, ProfileResponse } from '../types';
import { qk } from './keys';

export function useProfile(username: string) {
  return useQuery({
    queryKey: qk.profile(username),
    queryFn: () => apiFetch<ProfileResponse>(`/profiles/${encodeURIComponent(username)}`),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiFetch<{ user: Me }>('/profiles/me', {
        method: 'PATCH',
        body: input as Record<string, unknown>,
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.me });
      const previous = qc.getQueryData<Me | null>(qk.me);
      if (previous) {
        qc.setQueryData<Me>(qk.me, {
          ...previous,
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          preferences: { ...previous.preferences, ...input.preferences },
          privacy: { ...previous.privacy, ...input.privacy },
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(qk.me, context.previous);
    },
    onSuccess: ({ user }) => {
      qc.setQueryData(qk.me, user);
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiFetch<{ avatarUrl: string }>('/profiles/me/avatar', { method: 'POST', body: form });
    },
    onSuccess: ({ avatarUrl }) => {
      const me = qc.getQueryData<Me | null>(qk.me);
      if (me) qc.setQueryData<Me>(qk.me, { ...me, avatarUrl });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useRemoveAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/profiles/me/avatar', { method: 'DELETE' }),
    onSuccess: () => {
      const me = qc.getQueryData<Me | null>(qk.me);
      if (me) qc.setQueryData<Me>(qk.me, { ...me, avatarUrl: null });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
