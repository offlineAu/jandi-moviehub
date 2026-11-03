import { Clock, Globe, Link2, ListVideo, Lock, Play, Users } from 'lucide-react';
import Link from 'next/link';
import { Artwork } from '@/components/movies/artwork';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Playlist } from '@/lib/queries/playlists';
import { cn } from '@/lib/utils';
import {
  describeTotalRuntime,
  formatTotalRuntime,
  pluralize,
  VISIBILITY_COPY,
} from './playlist-utils';

export const VISIBILITY_ICON = { PRIVATE: Lock, UNLISTED: Link2, PUBLIC: Globe } as const;

/** Fanned stack of the first posters, the "marathon reel" visual for a playlist. */
export function PlaylistPosterStack({ playlist }: { playlist: Playlist }) {
  const shown = playlist.items.slice(0, 4);
  if (!shown.length) {
    return (
      <div className="grid size-full place-items-center bg-[radial-gradient(80%_80%_at_30%_20%,#24173d,#11111d)] text-subtle">
        <ListVideo className="size-8" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div
      className="relative size-full bg-[radial-gradient(80%_80%_at_30%_20%,#24173d,#11111d)]"
      aria-hidden="true"
    >
      {shown.map((item, i) => (
        <div
          key={item.id}
          className="absolute top-1/2 aspect-[2/3] h-[82%] overflow-hidden rounded-lg bg-surface shadow-[0_10px_30px_-8px_rgb(0_0_0/0.9)] ring-1 ring-white/10"
          style={{
            left: `${8 + i * 19}%`,
            zIndex: 4 - i,
            transform: `translateY(-50%) rotate(${(i - 1.5) * 3.5}deg)`,
          }}
        >
          <Artwork
            src={item.movie.posterUrl}
            alt=""
            sizes="120px"
            fallbackTitle={item.movie.title}
          />
        </div>
      ))}
    </div>
  );
}

export function PlaylistCard({
  playlist,
  viewerId,
  showOwner,
}: {
  playlist: Playlist;
  viewerId?: string;
  showOwner?: boolean;
}) {
  const VisibilityIcon = VISIBILITY_ICON[playlist.visibility];
  const isCollab = !!viewerId && playlist.owner.id !== viewerId;
  return (
    <article className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary/40 focus-within:border-primary/40">
      <div className="aspect-[16/9] overflow-hidden">
        <PlaylistPosterStack playlist={playlist} />
      </div>
      <div className="grid gap-1.5 px-4 py-3.5">
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <Link
            href={`/playlists/${playlist.id}`}
            className="truncate rounded after:absolute after:inset-0 focus-ring"
          >
            {playlist.name}
          </Link>
          <VisibilityIcon
            className="size-3.5 shrink-0 text-muted"
            aria-label={VISIBILITY_COPY[playlist.visibility].label}
          />
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{pluralize(playlist.itemCount, 'movie')}</span>
          {playlist.totalRuntimeSec > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              <span aria-hidden="true">{formatTotalRuntime(playlist.totalRuntimeSec)}</span>
              <span className="sr-only">{describeTotalRuntime(playlist.totalRuntimeSec)}</span>
            </span>
          ) : null}
          {playlist.playableCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[#6ee7b7]">
              <Play className="size-3 fill-current" aria-hidden="true" />
              {playlist.playableCount} playable
            </span>
          ) : null}
        </p>
        {showOwner || isCollab || playlist.collaborators.length ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            {showOwner || isCollab ? (
              <>
                <Avatar
                  src={playlist.owner.avatarUrl}
                  name={playlist.owner.displayName}
                  size="xs"
                />
                <span className="truncate">by {playlist.owner.displayName}</span>
              </>
            ) : null}
            {isCollab ? (
              <Badge variant="primary" className="ml-auto">
                Collaborator
              </Badge>
            ) : !showOwner && playlist.collaborators.length ? (
              <span className={cn('inline-flex items-center gap-1')}>
                <Users className="size-3.5" aria-hidden="true" />
                {pluralize(playlist.collaborators.length, 'collaborator')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function PlaylistGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading playlists"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="grid gap-2 px-4 py-3.5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
