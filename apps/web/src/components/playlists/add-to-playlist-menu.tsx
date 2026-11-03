'use client';

import { Check, ListVideo, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage } from '@/lib/api';
import { useAddPlaylistItem, usePlaylists, type Playlist } from '@/lib/queries/playlists';
import type { MovieSummary } from '@/lib/types';
import { CreatePlaylistDialog } from './playlist-dialogs';

/** Movie page action: append the movie to one of my editable playlists (or a new one). */
export function AddToPlaylistMenu({ movie }: { movie: Pick<MovieSummary, 'id' | 'title'> }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const lists = usePlaylists(open);
  const add = useAddPlaylistItem();
  const [createOpen, setCreateOpen] = React.useState(false);
  const editable = (lists.data?.items ?? []).filter((p) => p.canEdit);

  const addTo = (playlist: Pick<Playlist, 'id' | 'name'>) =>
    add.mutateAsync({ playlistId: playlist.id, movieId: movie.id }).then(
      () =>
        toast.success(`Added to “${playlist.name}”`, {
          action: { label: 'Open', onClick: () => router.push(`/playlists/${playlist.id}`) },
        }),
      (error: unknown) => toast.error(errorMessage(error, 'Couldn’t add it to the playlist.')),
    );

  return (
    <>
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="lg" loading={add.isPending} loadingText="Adding">
            <ListVideo aria-hidden="true" />
            Add to playlist
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Add to playlist…</DropdownMenuLabel>
          {lists.isLoading ? (
            <div className="flex justify-center py-3 text-muted">
              <Spinner className="size-4" label="Loading playlists" />
            </div>
          ) : lists.isError ? (
            <p className="px-2.5 py-2 text-sm text-danger">Playlists didn’t load.</p>
          ) : editable.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted">You don’t have any playlists yet.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {editable.map((p) => {
                const contains = p.items.some((i) => i.movie.id === movie.id);
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onSelect={() => {
                      if (contains) {
                        toast(`“${movie.title}” is already in “${p.name}”`, {
                          action: { label: 'Add again', onClick: () => void addTo(p) },
                        });
                      } else void addTo(p);
                    }}
                  >
                    {contains ? (
                      <Check className="text-primary!" aria-hidden="true" />
                    ) : (
                      <ListVideo aria-hidden="true" />
                    )}
                    <span className="truncate">{p.name}</span>
                    {contains ? <span className="sr-only">(already added)</span> : null}
                    <span className="ml-auto text-xs text-muted">{p.itemCount}</span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New playlist…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreatePlaylistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(playlist) => {
          void addTo(playlist);
        }}
      />
    </>
  );
}
