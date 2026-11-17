'use client';

import { roomTvTitle, selectionTitle, type ExternalMedia, type RoomTvEpisode } from '@jandi/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import { useChangeRoomMovie } from './room-dialogs';

type Props = {
  roomId: string;
  socket: Socket | null;
  engine: RoomSyncEngine | null;
  canControl: boolean;
  marathonActive: boolean;
};
type Destination = { id: string; label: string; availability: 'listed' };
type Navigation = {
  assetId: string | null;
  previous: Destination | null;
  next: Destination | null;
};

function EpisodeButtons({ assetId, title, ...props }: Props & { assetId: string; title: string }) {
  const nav = useQuery({
    queryKey: ['rooms', props.roomId, 'episode-navigation', assetId],
    queryFn: ({ signal }) =>
      apiFetch<Navigation>(`/rooms/${encodeURIComponent(props.roomId)}/episode-navigation`, {
        signal,
      }),
    enabled: !props.marathonActive,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data && query.state.data.assetId !== assetId ? 2000 : false,
  });
  const { change, busy } = useChangeRoomMovie(props.roomId, props.socket, props.engine);
  const [preparing, setPreparing] = React.useState<string | null>(null);
  if (props.marathonActive) return null;
  const data = nav.data?.assetId === assetId ? nav.data : null;
  const select = async (direction: 'previous' | 'next', target: Destination) => {
    setPreparing(target.label);
    try {
      const ok = await change(target.id, `${target.label} selected for everyone`, direction);
      if (!ok) void nav.refetch();
    } finally {
      setPreparing(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-glass-1 px-4 py-3 text-sm">
      <span className="text-muted">{title}</span>
      {preparing ? (
        <span role="status" className="text-muted">
          Preparing {preparing}…
        </span>
      ) : nav.isPending || (!nav.isError && !data) ? (
        <span className="text-muted">Loading episodes…</span>
      ) : nav.isError ? (
        <button type="button" onClick={() => void nav.refetch()} className="text-muted underline">
          Couldn’t load episodes · Try again
        </button>
      ) : props.canControl ? (
        <nav aria-label="Episode navigation" className="flex flex-wrap gap-2">
          {(['previous', 'next'] as const).map((direction) => {
            const target = data?.[direction];
            return target ? (
              <Button
                key={direction}
                size="sm"
                variant="secondary"
                disabled={busy}
                title="Listed by the provider; playback has not been checked yet"
                onClick={() => void select(direction, target)}
              >
                {direction === 'previous' && <ChevronLeft aria-hidden="true" />}
                {direction === 'previous' ? 'Previous' : 'Next'} · {target.label}
                {direction === 'next' && <ChevronRight aria-hidden="true" />}
              </Button>
            ) : null;
          })}
          {!data?.next && <span className="self-center text-muted">No later episode listed</span>}
        </nav>
      ) : (
        <span className="text-muted">
          {data?.next ? `Up next: ${data.next.label}` : 'No later episode listed.'}
        </span>
      )}
    </div>
  );
}
export function ProviderEpisodeBar({ episode, ...props }: Props & { episode: RoomTvEpisode }) {
  return (
    <EpisodeButtons
      {...props}
      assetId={roomTvTitle(episode)}
      title={`Money Heist · Part ${episode.season} E${episode.episode}`}
    />
  );
}
export function VidsrcEpisodeBar({
  episode,
  ...props
}: Props & { episode: Extract<ExternalMedia, { type: 'tv' }> }) {
  return (
    <EpisodeButtons
      {...props}
      assetId={selectionTitle(episode)}
      title={`Series · S${episode.season} E${episode.episode}`}
    />
  );
}
