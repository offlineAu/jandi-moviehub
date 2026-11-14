'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LoadingCards } from '@/components/ui/loading';
import { apiFetch, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';

type Saved = { tmdbId: number; title: string; posterUrl: string | null };
function useSaved(enabled = true) {
  return useQuery({
    queryKey: ['saved-tv'],
    queryFn: () => apiFetch<{ items: Saved[] }>('/saved-tv'),
    enabled,
  });
}
export function SaveTvButton({ id }: { id: number }) {
  const me = useMe();
  const client = useQueryClient();
  const list = useSaved(!!me.data && !me.data.isGuest);
  const saved = list.data?.items.some((item) => item.tmdbId === id) ?? false;
  const action = useMutation({
    mutationFn: () => apiFetch(`/saved-tv/${id}`, { method: saved ? 'DELETE' : 'PUT' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['saved-tv'] });
      toast.success(saved ? 'Removed from TV watchlist' : 'Added to TV watchlist');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (me.isLoading) return null;
  if (!me.data || me.data.isGuest)
    return (
      <Button asChild variant="secondary">
        <Link href="/login">Sign in to save</Link>
      </Button>
    );
  return (
    <Button
      variant="secondary"
      disabled={list.isLoading || list.isError}
      loading={action.isPending}
      onClick={() => action.mutate()}
    >
      {list.isError
        ? 'Watchlist unavailable'
        : saved
          ? 'Remove from TV watchlist'
          : 'Add to TV watchlist'}
    </Button>
  );
}
export function SavedTvList() {
  const list = useSaved();
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">TV watchlist</h2>
      {list.isLoading ? (
        <div className="mt-4">
          <LoadingCards label="Loading saved series" count={6} itemClassName="h-24" />
        </div>
      ) : list.isError ? (
        <p className="mt-3 text-muted">Saved series could not be loaded.</p>
      ) : !list.data?.items.length ? (
        <p className="mt-3 text-muted">No TV series saved yet.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.items.map((item) => (
            <li key={item.tmdbId}>
              <Link
                href={`/tv/${item.tmdbId}`}
                className="block rounded-xl border border-border bg-surface p-4 hover:border-primary"
              >
                {item.title}
                <span className="block text-sm text-muted">TV series</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
