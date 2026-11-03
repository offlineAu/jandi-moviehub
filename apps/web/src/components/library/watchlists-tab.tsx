'use client';

import { ListPlus, Lock, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Artwork } from '@/components/movies/artwork';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/queries/auth';
import { useWatchlists } from '@/lib/queries/library';
import type { Watchlist } from '@/lib/types';
import { WatchlistOwnerMenu } from './watchlist-card-menu';
import { CreateWatchlistDialog } from './watchlist-dialogs';

function PosterStack({ posters, name }: { posters: string[]; name: string }) {
  const shown = posters.slice(0, 3);
  if (!shown.length) {
    return (
      <div className="grid size-full place-items-center bg-[radial-gradient(80%_80%_at_30%_20%,#24173d,#11111d)] text-subtle">
        <ListPlus className="size-8" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div
      className="relative size-full bg-[radial-gradient(80%_80%_at_30%_20%,#24173d,#11111d)]"
      aria-label={`Posters in ${name}`}
      role="img"
    >
      {shown.map((src, i) => (
        <div
          key={`${src}-${i}`}
          className="absolute top-1/2 aspect-[2/3] h-[82%] overflow-hidden rounded-lg shadow-[0_10px_30px_-8px_rgb(0_0_0/0.9)] ring-1 ring-white/10"
          style={{
            left: `${12 + i * 22}%`,
            zIndex: 3 - i,
            transform: `translateY(-50%) rotate(${(i - 1) * 4}deg)`,
          }}
        >
          <Artwork src={src} alt="" sizes="120px" />
        </div>
      ))}
    </div>
  );
}

function WatchlistCard({ list, isOwner }: { list: Watchlist; isOwner: boolean }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary/40">
      <div className="aspect-[16/9] overflow-hidden">
        <PosterStack posters={list.previewPosters} name={list.name} />
      </div>
      <div className="px-4 py-3.5">
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <Link
            href={`/library/watchlists/${list.id}`}
            className="truncate rounded after:absolute after:inset-0 focus-ring"
          >
            {list.name}
          </Link>
          {list.isDefault ? (
            <Lock className="size-3.5 shrink-0 text-muted" aria-label="Default list" />
          ) : null}
        </h3>
        <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
          {list.itemCount} {list.itemCount === 1 ? 'title' : 'titles'}
          {list.isGroup ? (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              Shared with {list.members.length}
            </span>
          ) : null}
        </p>
      </div>
      {isOwner ? (
        <WatchlistOwnerMenu watchlist={list} className="absolute right-3 top-3 z-10" />
      ) : null}
    </article>
  );
}

export function WatchlistsTab() {
  const me = useMe();
  const query = useWatchlists();
  const [createOpen, setCreateOpen] = React.useState(false);

  const header = (
    <div className="mb-5 flex items-center justify-between gap-4">
      <p className="text-sm text-muted">Lists you own and lists friends share with you.</p>
      <Button onClick={() => setCreateOpen(true)} size="sm">
        <Plus aria-hidden="true" />
        New watchlist
      </Button>
    </div>
  );

  let body: React.ReactNode;
  if (query.isLoading) {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-[16/12] rounded-2xl" />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  } else if (!query.data?.items.length) {
    body = (
      <EmptyState
        icon={ListPlus}
        title="No watchlists yet"
        description="Make a list for date night, a horror marathon, or anything you want to line up for later."
        action={<Button onClick={() => setCreateOpen(true)}>Create a watchlist</Button>}
      />
    );
  } else {
    body = (
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {query.data.items.map((list) => (
          <li key={list.id}>
            <WatchlistCard list={list} isOwner={list.owner.id === me.data?.id} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {header}
      {body}
      <CreateWatchlistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
