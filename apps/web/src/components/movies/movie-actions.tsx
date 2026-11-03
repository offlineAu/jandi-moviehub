'use client';

import { Check, Heart, ListPlus, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { CreateWatchlistDialog } from '@/components/library/watchlist-dialogs';
import { AddToPlaylistMenu } from '@/components/playlists/add-to-playlist-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage } from '@/lib/api';
import {
  useLibraryStatus,
  useToggleFavorite,
  useToggleWatchlistItem,
  useWatchlists,
} from '@/lib/queries/library';
import type { Me, MovieSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

function SignInToSave({ me, children }: { me: Me | null | undefined; children: React.ReactNode }) {
  const pathname = usePathname();
  if (me && !me.isGuest) return <>{children}</>;
  return (
    <Button asChild variant="secondary" size="lg">
      <Link href={me?.isGuest ? '/register' : `/login?next=${encodeURIComponent(pathname)}`}>
        <Heart aria-hidden="true" />
        {me?.isGuest ? 'Create an account to save' : 'Log in to save'}
      </Link>
    </Button>
  );
}

export function FavoriteButton({ movie }: { movie: MovieSummary }) {
  const status = useLibraryStatus(movie.id);
  const toggle = useToggleFavorite(movie.id);
  const favorite = !!status.data?.favorite;
  return (
    <Button
      variant="secondary"
      size="lg"
      aria-pressed={favorite}
      disabled={status.isLoading || !status.data}
      onClick={() => {
        const next = !favorite;
        toggle.mutate(next, {
          onSuccess: () => toast.success(next ? 'Added to favorites' : 'Removed from favorites'),
          onError: (error) =>
            toast.error(errorMessage(error, 'Couldn’t update favorites. Try again.')),
        });
      }}
    >
      <Heart className={cn(favorite && 'fill-accent text-accent')} aria-hidden="true" />
      {favorite ? 'Favorited' : 'Favorite'}
    </Button>
  );
}

export function WatchlistMenu({ movie }: { movie: MovieSummary }) {
  const status = useLibraryStatus(movie.id);
  const lists = useWatchlists();
  const toggle = useToggleWatchlistItem(movie.id);
  const [createOpen, setCreateOpen] = React.useState(false);
  const inLists = new Set(status.data?.watchlistIds ?? []);
  const count = inLists.size;

  const setMembership = (watchlistId: string, name: string, add: boolean) =>
    toggle.mutateAsync({ watchlistId, add }).then(
      () => toast.success(add ? `Added to “${name}”` : `Removed from “${name}”`),
      (error: unknown) =>
        toast.error(errorMessage(error, 'Couldn’t update the watchlist. Try again.')),
    );

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="lg" disabled={status.isLoading}>
            {count ? <Check aria-hidden="true" /> : <ListPlus aria-hidden="true" />}
            {count ? `In ${count} ${count === 1 ? 'list' : 'lists'}` : 'Add to watchlist'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Save to…</DropdownMenuLabel>
          {lists.isLoading ? (
            <div className="flex justify-center py-3 text-muted">
              <Spinner className="size-4" label="Loading watchlists" />
            </div>
          ) : lists.isError ? (
            <p className="px-2.5 py-2 text-sm text-danger">Watchlists didn’t load.</p>
          ) : (
            lists.data?.items.map((list) => (
              <DropdownMenuCheckboxItem
                key={list.id}
                checked={inLists.has(list.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) =>
                  void setMembership(list.id, list.name, checked === true)
                }
              >
                <span className="truncate">{list.name}</span>
                <span className="ml-auto text-xs text-muted">{list.itemCount}</span>
              </DropdownMenuCheckboxItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New watchlist…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWatchlistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(watchlist) => {
          void setMembership(watchlist.id, watchlist.name, true);
        }}
      />
    </>
  );
}

export function LibraryActions({ movie, me }: { movie: MovieSummary; me: Me | null | undefined }) {
  return (
    <SignInToSave me={me}>
      <FavoriteButton movie={movie} />
      <WatchlistMenu movie={movie} />
      <AddToPlaylistMenu movie={movie} />
    </SignInToSave>
  );
}
