'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { errorMessage } from '@/lib/api';
import { useDeleteWatchlist } from '@/lib/queries/library';
import type { Watchlist } from '@/lib/types';
import { cn } from '@/lib/utils';
import { RenameWatchlistDialog } from './watchlist-dialogs';

export function WatchlistOwnerMenu({
  watchlist,
  className,
  redirectAfterDelete,
}: {
  watchlist: Watchlist;
  className?: string;
  redirectAfterDelete?: string;
}) {
  const router = useRouter();
  const remove = useDeleteWatchlist();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={`Options for ${watchlist.name}`}
          className={cn(
            'grid size-9 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-black/70 focus-ring',
            className,
          )}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <Pencil aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          {watchlist.isDefault ? null : (
            <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameWatchlistDialog watchlist={watchlist} open={renameOpen} onOpenChange={setRenameOpen} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${watchlist.name}”?`}
        description={`The list and its ${watchlist.itemCount} ${watchlist.itemCount === 1 ? 'title' : 'titles'} will be removed. The movies stay in the catalog.`}
        confirmLabel="Delete watchlist"
        pendingLabel="Deleting"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(watchlist.id, {
            onSuccess: () => {
              toast.success(`Deleted “${watchlist.name}”`);
              setDeleteOpen(false);
              if (redirectAfterDelete) router.push(redirectAfterDelete);
            },
            onError: (error) =>
              toast.error(errorMessage(error, 'Couldn’t delete the watchlist. Try again.')),
          })
        }
      />
    </>
  );
}
