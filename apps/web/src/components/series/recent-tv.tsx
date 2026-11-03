'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { apiFetch, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';

type Visit = {
  tmdbId: number;
  title: string;
  season: number | null;
  episode: number | null;
  viewedAt: string;
};
export function RecordTvVisit({
  id,
  season,
  episode,
}: {
  id: string;
  season?: string;
  episode?: string;
}) {
  const me = useMe();
  const accountId = me.data && !me.data.isGuest ? me.data.id : null;
  const client = useQueryClient();
  React.useEffect(() => {
    if (!accountId) return;
    const body =
      season !== undefined && episode !== undefined
        ? { season: Number(season), episode: Number(episode) }
        : {};
    void apiFetch(`/recent-tv/${encodeURIComponent(id)}`, { method: 'PUT', body })
      .then(() => client.invalidateQueries({ queryKey: ['recent-tv'] }))
      .catch(() => undefined);
  }, [accountId, id, season, episode, client]);
  return null;
}
export function RecentTvList() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['recent-tv'],
    queryFn: () => apiFetch<{ items: Visit[] }>('/recent-tv'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/recent-tv/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['recent-tv'] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">Recently viewed TV pages</h2>
      <p className="mt-2 text-sm text-muted">
        Pages you opened; this does not mean the episodes were watched.
      </p>
      {query.isLoading ? (
        <p className="mt-3 text-muted">Loading recent TV pages…</p>
      ) : query.isError ? (
        <p className="mt-3 text-muted">Recent TV pages could not be loaded.</p>
      ) : !query.data?.items.length ? (
        <p className="mt-3 text-muted">No TV pages viewed yet.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {query.data.items.map((item) => (
            <li
              key={item.tmdbId}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4"
            >
              <Link
                className="hover:underline"
                href={
                  item.season !== null && item.episode !== null
                    ? `/watch/tv/${item.tmdbId}/season/${item.season}/episode/${item.episode}`
                    : `/tv/${item.tmdbId}`
                }
              >
                {item.title}
                {item.season !== null && item.episode !== null && (
                  <span className="block text-sm text-muted">
                    Season {item.season} · Episode {item.episode}
                  </span>
                )}
              </Link>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.tmdbId)}
                className="h-8 rounded-full px-3 text-sm text-muted transition-colors hover:bg-white/[0.07] hover:text-foreground active:scale-95 focus-ring disabled:opacity-50"
                aria-label={`Remove ${item.title} from recently viewed`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
