'use client';

import {
  ArrowLeft,
  Clapperboard,
  Clock,
  CopyPlus,
  ListVideo,
  LogOut,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Artwork } from '@/components/movies/artwork';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage, isApiError } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';
import {
  useDeletePlaylist,
  useDuplicatePlaylist,
  usePlaylist,
  useRemoveCollaborator,
  type Playlist,
} from '@/lib/queries/playlists';
import type { Me } from '@/lib/types';
import { AddMovieDialog } from './add-movie-dialog';
import { CollaboratorsDialog } from './collaborators-dialog';
import { EditPlaylistDialog } from './playlist-dialogs';
import { PlaylistItems } from './playlist-items';
import { VISIBILITY_ICON } from './playlist-card';
import {
  describeTotalRuntime,
  formatTotalRuntime,
  pluralize,
  VISIBILITY_COPY,
} from './playlist-utils';
import { ShareDialog } from './share-dialog';

type DialogName = 'add' | 'edit' | 'share' | 'collaborators' | 'delete' | 'leave' | null;

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading playlist">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-10 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-5 flex gap-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="mt-6 flex gap-3">
        <Skeleton className="h-12 w-52 rounded-xl" />
        <Skeleton className="h-12 w-32 rounded-xl" />
      </div>
      <div className="mt-10 grid gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-muted" aria-hidden="true" />
      {children}
    </span>
  );
}

function PeopleStack({ playlist }: { playlist: Playlist }) {
  const people = [playlist.owner, ...playlist.collaborators];
  return (
    <span className="flex -space-x-2">
      {people.slice(0, 5).map((p, i) => (
        <Tooltip key={p.id} label={i === 0 ? `${p.displayName} (owner)` : p.displayName}>
          <Link href={`/profile/${p.username}`} className="rounded-full focus-ring">
            <Avatar
              src={p.avatarUrl}
              name={p.displayName}
              size="xs"
              className="ring-2 ring-background"
            />
            <span className="sr-only">{i === 0 ? `${p.displayName}, owner` : p.displayName}</span>
          </Link>
        </Tooltip>
      ))}
      {people.length > 5 ? (
        <span className="grid size-6 place-items-center rounded-full bg-surface-raised text-[10px] font-semibold ring-2 ring-background">
          +{people.length - 5}
        </span>
      ) : null}
    </span>
  );
}

function Header({
  playlist,
  me,
  open,
}: {
  playlist: Playlist;
  me: Me | null | undefined;
  open: (name: DialogName) => void;
}) {
  const router = useRouter();
  const duplicate = useDuplicatePlaylist();
  const VisibilityIcon = VISIBILITY_ICON[playlist.visibility];
  const isAccount = !!me && !me.isGuest;
  const isCollaborator = !!me && playlist.collaborators.some((c) => c.id === me.id);
  const backdrop = playlist.items.find((i) => i.movie.backdropUrl)?.movie.backdropUrl;
  const unavailable = playlist.itemCount - playlist.playableCount;

  const onDuplicate = () =>
    duplicate.mutate(playlist.id, {
      onSuccess: (copy) =>
        toast.success(`Saved “${copy.name}” to your playlists`, {
          action: { label: 'Open', onClick: () => router.push(`/playlists/${copy.id}`) },
        }),
      onError: (error) => toast.error(errorMessage(error, 'Couldn’t duplicate it. Try again.')),
    });

  return (
    <header className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface">
      {backdrop ? (
        <div className="absolute inset-0 -z-10 opacity-30" aria-hidden="true">
          <Artwork src={backdrop} alt="" sizes="100vw" kind="backdrop" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-surface/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_10%_0%,rgb(147_51_234/0.18),transparent_70%)]"
        />
      )}
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
          <ListVideo className="size-4 text-primary" aria-hidden="true" />
          Playlist
        </p>
        <h1 className="mt-2 break-words font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {playlist.name}
        </h1>
        {playlist.description ? (
          <p className="mt-2 max-w-2xl whitespace-pre-line text-foreground/80">
            {playlist.description}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Badge variant="neutral">
            <VisibilityIcon aria-hidden="true" />
            {VISIBILITY_COPY[playlist.visibility].label}
          </Badge>
          <span className="inline-flex min-w-0 items-center gap-2">
            <PeopleStack playlist={playlist} />
            <span className="truncate text-muted">
              by{' '}
              <Link
                href={`/profile/${playlist.owner.username}`}
                className="rounded text-foreground hover:underline focus-ring"
              >
                {playlist.owner.displayName}
              </Link>
              {playlist.collaborators.length
                ? ` + ${pluralize(playlist.collaborators.length, 'collaborator')}`
                : ''}
            </span>
          </span>
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div>
            <dt className="sr-only">Movies</dt>
            <dd>
              <Stat icon={ListVideo}>{pluralize(playlist.itemCount, 'movie')}</Stat>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Playable</dt>
            <dd>
              <Stat icon={Play}>
                <span className={playlist.playableCount ? 'text-[#6ee7b7]' : 'text-muted'}>
                  {playlist.playableCount} playable
                </span>
              </Stat>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Total runtime</dt>
            <dd>
              <Stat icon={Clock}>
                <span aria-hidden="true">{formatTotalRuntime(playlist.totalRuntimeSec)}</span>
                <span className="sr-only">{describeTotalRuntime(playlist.totalRuntimeSec)}</span>
                <span className="text-muted">total</span>
              </Stat>
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
          {isAccount ? (
            playlist.playableCount > 0 ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={`/rooms/new?playlistId=${encodeURIComponent(playlist.id)}`}>
                  <Clapperboard aria-hidden="true" />
                  Watch as a marathon
                </Link>
              </Button>
            ) : (
              <Tooltip label="Add a movie that’s available to stream first">
                <span tabIndex={0} className="w-full rounded-xl focus-ring sm:w-auto">
                  <Button
                    size="lg"
                    disabled
                    aria-disabled="true"
                    tabIndex={-1}
                    className="w-full sm:w-auto"
                  >
                    <Clapperboard aria-hidden="true" />
                    Watch as a marathon
                  </Button>
                </span>
              </Tooltip>
            )
          ) : null}
          <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
            {playlist.canEdit ? (
              <Button
                variant="secondary"
                size="lg"
                className="min-w-0 flex-1 px-3 sm:flex-none sm:px-6"
                onClick={() => open('add')}
              >
                <Plus aria-hidden="true" />
                Add movies
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="lg"
              className="min-w-0 flex-1 px-3 sm:flex-none sm:px-6"
              onClick={() => open('share')}
            >
              <Share2 aria-hidden="true" />
              Share
            </Button>
            {isAccount ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-12 shrink-0 rounded-xl"
                    aria-label="More playlist actions"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {playlist.isOwner ? (
                    <DropdownMenuItem onSelect={() => open('edit')}>
                      <Pencil aria-hidden="true" />
                      Edit details
                    </DropdownMenuItem>
                  ) : null}
                  {playlist.isOwner || isCollaborator ? (
                    <DropdownMenuItem onSelect={() => open('collaborators')}>
                      <Users aria-hidden="true" />
                      {playlist.isOwner ? 'Manage collaborators' : 'Collaborators'}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={onDuplicate} disabled={duplicate.isPending}>
                    <CopyPlus aria-hidden="true" />
                    Duplicate to my playlists
                  </DropdownMenuItem>
                  {playlist.isOwner ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => open('delete')}>
                        <Trash2 aria-hidden="true" />
                        Delete playlist
                      </DropdownMenuItem>
                    </>
                  ) : isCollaborator ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => open('leave')}>
                        <LogOut aria-hidden="true" />
                        Leave playlist
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        {isAccount && unavailable > 0 && playlist.playableCount > 0 ? (
          <p className="mt-3 text-xs text-muted">
            {pluralize(unavailable, 'title')} {unavailable === 1 ? 'isn’t' : 'aren’t'} available to
            stream and will be skipped in a marathon.
          </p>
        ) : null}
        {!playlist.canEdit && isAccount ? (
          <p className="mt-3 text-xs text-muted">
            You’re viewing someone else’s playlist. Duplicate it to make your own edits.
          </p>
        ) : null}
      </div>
    </header>
  );
}

function Detail({ id }: { id: string }) {
  const router = useRouter();
  const me = useMe();
  const query = usePlaylist(id);
  const remove = useDeletePlaylist();
  const leave = useRemoveCollaborator(id);
  const [dialog, setDialog] = React.useState<DialogName>(null);
  const setOpen = (name: Exclude<DialogName, null>) => (o: boolean) => setDialog(o ? name : null);

  if (query.isLoading) return <DetailSkeleton />;
  if (query.isError || !query.data) {
    const missing = isApiError(query.error) && [403, 404].includes(query.error.status);
    return missing ? (
      <EmptyState
        icon={ListVideo}
        title="This playlist isn’t available"
        description="It may have been deleted or made private, or you’re no longer a collaborator."
        action={
          <Button asChild variant="secondary">
            <Link href="/playlists">Back to playlists</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState
        title="This playlist didn’t load"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const playlist = query.data;
  const user = me.data;

  return (
    <>
      <Header playlist={playlist} me={user} open={setDialog} />

      <section aria-labelledby="playlist-lineup" className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="playlist-lineup" className="font-display text-xl font-semibold">
            Running order
          </h2>
          {playlist.canEdit && playlist.itemCount > 1 ? (
            <p className="hidden text-xs text-muted sm:block">
              Drag the handle or use the arrows to reorder.
            </p>
          ) : null}
        </div>
        {playlist.items.length === 0 ? (
          <EmptyState
            icon={ListVideo}
            title="No movies yet"
            description={
              playlist.canEdit
                ? 'Add movies in the order you want to watch them. You can reorder any time.'
                : 'The owner hasn’t added any movies yet.'
            }
            action={
              playlist.canEdit ? (
                <Button onClick={() => setDialog('add')}>
                  <Plus aria-hidden="true" />
                  Add movies
                </Button>
              ) : undefined
            }
          />
        ) : (
          <PlaylistItems playlist={playlist} />
        )}
      </section>

      {playlist.canEdit ? (
        <AddMovieDialog playlist={playlist} open={dialog === 'add'} onOpenChange={setOpen('add')} />
      ) : null}
      {playlist.isOwner ? (
        <EditPlaylistDialog
          playlist={playlist}
          open={dialog === 'edit'}
          onOpenChange={setOpen('edit')}
        />
      ) : null}
      <ShareDialog playlist={playlist} open={dialog === 'share'} onOpenChange={setOpen('share')} />
      <CollaboratorsDialog
        playlist={playlist}
        me={user}
        open={dialog === 'collaborators'}
        onOpenChange={setOpen('collaborators')}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={setOpen('delete')}
        title={`Delete “${playlist.name}”?`}
        description={`The playlist and its running order of ${pluralize(playlist.itemCount, 'movie')} will be removed for you and any collaborators. The movies stay in the catalog.`}
        confirmLabel="Delete playlist"
        pendingLabel="Deleting"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(playlist.id, {
            onSuccess: () => {
              toast.success(`Deleted “${playlist.name}”`);
              setDialog(null);
              router.push('/playlists');
            },
            onError: (error) =>
              toast.error(errorMessage(error, 'Couldn’t delete the playlist. Try again.')),
          })
        }
      />
      {user ? (
        <ConfirmDialog
          open={dialog === 'leave'}
          onOpenChange={setOpen('leave')}
          title={`Leave “${playlist.name}”?`}
          description="You won’t be able to edit it anymore, and it disappears from your playlists unless it’s public."
          confirmLabel="Leave playlist"
          pendingLabel="Leaving"
          pending={leave.isPending}
          onConfirm={() =>
            leave.mutate(user.id, {
              onSuccess: () => {
                toast.success(`You left “${playlist.name}”`);
                setDialog(null);
                router.push('/playlists');
              },
              onError: (error) => toast.error(errorMessage(error, 'Couldn’t leave. Try again.')),
            })
          }
        />
      ) : null}
    </>
  );
}

export function PlaylistDetailView({ id }: { id: string }) {
  return (
    <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <Link
        href="/playlists"
        className="mb-5 inline-flex items-center gap-1.5 rounded text-sm text-muted hover:text-foreground focus-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Playlists
      </Link>
      <Detail id={id} />
    </div>
  );
}
