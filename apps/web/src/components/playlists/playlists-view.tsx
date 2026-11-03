'use client';

import { Globe, ListVideo, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useUrlState } from '@/components/browse/use-url-state';
import { RequireAccount } from '@/components/layout/require-account';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlaylists, usePublicPlaylists } from '@/lib/queries/playlists';
import type { Me } from '@/lib/types';
import { CreatePlaylistDialog } from './playlist-dialogs';
import { PlaylistCard, PlaylistGridSkeleton } from './playlist-card';

const gridClass = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

function MinePanel({ me, onCreate }: { me: Me; onCreate: () => void }) {
  const query = usePlaylists();
  if (query.isLoading) return <PlaylistGridSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        title="Your playlists didn’t load"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const items = query.data?.items ?? [];
  if (!items.length) {
    return (
      <EmptyState
        icon={ListVideo}
        title="No playlists yet"
        description="Build a running order — a trilogy, a director deep-dive, a scary-movie night — then watch it as a marathon with friends."
        action={
          <Button onClick={onCreate}>
            <Plus aria-hidden="true" />
            Create a playlist
          </Button>
        }
      />
    );
  }
  const owned = items.filter((p) => p.owner.id === me.id);
  const shared = items.filter((p) => p.owner.id !== me.id);
  return (
    <div className="grid gap-10">
      <section aria-labelledby="owned-playlists">
        <h2 id="owned-playlists" className="mb-4 font-display text-lg font-semibold">
          Created by you
        </h2>
        {owned.length ? (
          <ul className={gridClass}>
            {owned.map((p) => (
              <li key={p.id}>
                <PlaylistCard playlist={p} viewerId={me.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You haven’t created a playlist yet.</p>
        )}
      </section>
      {shared.length ? (
        <section aria-labelledby="collab-playlists">
          <h2 id="collab-playlists" className="mb-4 font-display text-lg font-semibold">
            Collaborations
          </h2>
          <ul className={gridClass}>
            {shared.map((p) => (
              <li key={p.id}>
                <PlaylistCard playlist={p} viewerId={me.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PublicPanel({
  me,
  page,
  onPageChange,
}: {
  me: Me;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const query = usePublicPlaylists(page);
  if (query.isLoading) return <PlaylistGridSkeleton count={6} />;
  if (query.isError) {
    return (
      <ErrorState
        title="Public playlists didn’t load"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const data = query.data;
  if (!data?.items.length) {
    return (
      <EmptyState
        icon={Globe}
        title={page > 1 ? 'Nothing on this page' : 'No public playlists yet'}
        description={
          page > 1
            ? 'There are fewer public playlists than before.'
            : 'When someone makes a playlist public it shows up here. Make one of yours public to be the first.'
        }
        action={
          page > 1 ? (
            <Button variant="secondary" onClick={() => onPageChange(1)}>
              Back to the first page
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <>
      <p className="mb-4 text-sm text-muted" aria-live="polite">
        {data.total} public {data.total === 1 ? 'playlist' : 'playlists'}
      </p>
      <ul className={gridClass} aria-busy={query.isFetching || undefined}>
        {data.items.map((p) => (
          <li key={p.id}>
            <PlaylistCard playlist={p} viewerId={me.id} showOwner />
          </li>
        ))}
      </ul>
      <Pagination
        className="mt-8"
        page={data.page}
        totalPages={data.totalPages}
        onPageChange={onPageChange}
      />
    </>
  );
}

export function PlaylistsView() {
  const router = useRouter();
  const { params, set } = useUrlState();
  const tab = params.get('tab') === 'public' ? 'public' : 'mine';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <RequireAccount feature="Playlists">
      {(me) => (
        <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Playlists
              </h1>
              <p className="mt-1 text-sm text-muted">
                Ordered movie lineups for marathons — yours, shared with you, and public picks.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              New playlist
            </Button>
          </div>
          <Tabs
            value={tab}
            onValueChange={(v) => set({ tab: v === 'mine' ? null : v, page: null })}
            className="mt-6"
          >
            <TabsList aria-label="Playlist sections">
              <TabsTrigger value="mine">
                <ListVideo aria-hidden="true" />
                My playlists
              </TabsTrigger>
              <TabsTrigger value="public">
                <Globe aria-hidden="true" />
                Public
              </TabsTrigger>
            </TabsList>
            <TabsContent value="mine">
              <MinePanel me={me} onCreate={() => setCreateOpen(true)} />
            </TabsContent>
            <TabsContent value="public">
              <PublicPanel
                me={me}
                page={page}
                onPageChange={(p) => set({ page: p === 1 ? null : p }, { resetPage: false })}
              />
            </TabsContent>
          </Tabs>
          <CreatePlaylistDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={(playlist) => router.push(`/playlists/${playlist.id}`)}
          />
        </div>
      )}
    </RequireAccount>
  );
}
