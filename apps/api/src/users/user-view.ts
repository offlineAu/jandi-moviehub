import type { User, UserProfile } from '@prisma/client';

export const avatarUrl = (key: string | null | undefined) =>
  key ? `/api/v1/profiles/avatars/${encodeURIComponent(key.replace(/^avatars\//, ''))}` : null;

export type UserWithProfile = User & { profile: UserProfile | null };

/** Minimal public identity shown to other users. */
export function publicUser(user: UserWithProfile) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    avatarUrl: avatarUrl(user.profile?.avatarKey),
    isGuest: user.isGuest,
  };
}
