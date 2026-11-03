'use client';

import { EyeOff } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Friendship, PublicUser } from '@/lib/types';
import { FriendButton } from './friend-button';
import { FRIENDSHIP_STATUS_TEXT } from './social-utils';

/** Identity card for a profile hidden by privacy settings (403 PROFILE_PRIVATE). */
export function PrivateProfile({
  identity,
}: {
  identity: PublicUser & { friendship: Friendship };
}) {
  const status = identity.friendship === 'none' ? '' : FRIENDSHIP_STATUS_TEXT[identity.friendship];
  return (
    <div className="pb-8">
      <header className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(60%_120%_at_10%_0%,rgb(147_51_234/0.18),transparent_70%)]"
        />
        <div className="relative flex flex-col gap-6 px-4 pb-8 pt-10 sm:flex-row sm:items-end sm:px-6 lg:px-10 lg:pt-14">
          <Avatar
            src={identity.avatarUrl}
            name={identity.displayName}
            size="xl"
            className="ring-4 ring-background"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {identity.displayName}
              </h1>
              {status ? <Badge variant="primary">{status}</Badge> : null}
            </div>
            <p className="mt-1 text-muted">@{identity.username}</p>
          </div>
          <FriendButton user={identity} friendship={identity.friendship} />
        </div>
      </header>
      <p className="mt-10 flex items-start gap-2 px-4 text-sm text-muted sm:px-6 lg:px-10">
        <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {identity.friendship === 'friends'
          ? `@${identity.username} keeps their profile private.`
          : `@${identity.username} only shares their profile with friends.`}
      </p>
    </div>
  );
}
