'use client';

import { EyeOff, Heart, ListVideo, Pencil, UserRoundX } from 'lucide-react';
import Link from 'next/link';
import { MovieGrid } from '@/components/movies/movie-grid';
import { MovieRail } from '@/components/movies/movie-rail';
import { FriendButton } from '@/components/social/friend-button';
import { PrivateProfile } from '@/components/social/private-profile';
import { privateProfileIdentity } from '@/components/social/social-utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';
import { useProfile } from '@/lib/queries/profile';
import type { Friendship } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const FRIENDSHIP_LABEL: Partial<Record<Friendship, string>> = {
  friends: 'Friends',
  outgoing: 'Request sent',
  incoming: 'Wants to be friends',
};

export function ProfileView({ username }: { username: string }) {
  const query = useProfile(username);

  if (query.isLoading) {
    return (
      <div className="px-4 pb-8 pt-10 sm:px-6 lg:px-10">
        <div className="flex items-center gap-5">
          <Skeleton className="size-24 rounded-full" />
          <div className="grid gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    const status = isApiError(query.error) ? query.error.status : 0;
    const hidden = privateProfileIdentity(query.error);
    if (hidden) return <PrivateProfile identity={hidden} />;
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        {status === 404 ? (
          <EmptyState
            icon={UserRoundX}
            title="No one goes by that name"
            description={`We couldn’t find a profile for @${username}.`}
          />
        ) : status === 403 ? (
          <EmptyState
            icon={EyeOff}
            title="This profile is private"
            description={`@${username} only shares their profile with friends.`}
          />
        ) : (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </div>
    );
  }

  const { profile, favorites, history } = query.data;
  const joined = formatDate(profile.createdAt);
  const friendship = FRIENDSHIP_LABEL[profile.friendship];

  return (
    <div className="pb-8">
      <header className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(60%_120%_at_10%_0%,rgb(147_51_234/0.18),transparent_70%)]"
        />
        <div className="relative flex flex-col gap-6 px-4 pb-8 pt-10 sm:flex-row sm:items-end sm:px-6 lg:px-10 lg:pt-14">
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size="xl"
            className="ring-4 ring-background"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {profile.displayName}
              </h1>
              {friendship ? <Badge variant="primary">{friendship}</Badge> : null}
            </div>
            <p className="mt-1 text-muted">
              @{profile.username}
              {joined ? `, member since ${joined}` : ''}
            </p>
            {profile.bio ? (
              <p className="mt-3 max-w-2xl whitespace-pre-line leading-relaxed text-foreground/85">
                {profile.bio}
              </p>
            ) : null}
            <dl className="mt-4 flex gap-6 text-sm">
              <div className="flex items-center gap-1.5">
                <Heart className="size-4 text-accent" aria-hidden="true" />
                <dt className="sr-only">Favorites</dt>
                <dd>
                  <span className="font-semibold">{profile.stats.favorites}</span>{' '}
                  <span className="text-muted">
                    {profile.stats.favorites === 1 ? 'favorite' : 'favorites'}
                  </span>
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <ListVideo className="size-4 text-primary" aria-hidden="true" />
                <dt className="sr-only">Playlists</dt>
                <dd>
                  <span className="font-semibold">{profile.stats.playlists}</span>{' '}
                  <span className="text-muted">
                    {profile.stats.playlists === 1 ? 'playlist' : 'playlists'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
          {profile.friendship === 'self' ? (
            <Button asChild variant="secondary">
              <Link href="/settings">
                <Pencil aria-hidden="true" />
                Edit profile
              </Link>
            </Button>
          ) : (
            <FriendButton user={profile} friendship={profile.friendship} />
          )}
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-12">
        {favorites ? (
          favorites.length ? (
            <section aria-labelledby="favorites-title" className="px-4 sm:px-6 lg:px-10">
              <h2 id="favorites-title" className="mb-4 font-display text-xl font-semibold">
                Favorites
              </h2>
              <MovieGrid movies={favorites} />
            </section>
          ) : (
            <section className="px-4 sm:px-6 lg:px-10">
              <h2 className="mb-2 font-display text-xl font-semibold">Favorites</h2>
              <p className="text-sm text-muted">No favorites yet.</p>
            </section>
          )
        ) : (
          <p className="px-4 text-sm text-muted sm:px-6 lg:px-10">
            <EyeOff className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />
            Favorites aren’t shared on this profile.
          </p>
        )}
        {history ? (
          <MovieRail
            title="Recently watched"
            movies={history.map((h) => h.movie)}
            emptyText="Nothing watched recently."
          />
        ) : null}
      </div>
    </div>
  );
}
