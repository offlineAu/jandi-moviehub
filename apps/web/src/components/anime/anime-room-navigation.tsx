'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { selectionTitle, SocketEvents } from '@jandi/shared';
import type { Socket } from 'socket.io-client';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useChangeRoomMovie } from '@/components/rooms/room-dialogs';

export function AnimeRoomNavigation({
  roomId,
  sourceId,
  canControl,
  isHost,
  ended,
  marathonActive,
  socket,
  engine,
}: {
  roomId: string;
  sourceId: string;
  canControl: boolean;
  isHost: boolean;
  ended: boolean;
  marathonActive: boolean;
  socket: Socket | null;
  engine: RoomSyncEngine | null;
}) {
  const nav = useQuery({
    queryKey: ['anime-navigation', sourceId],
    queryFn: () =>
      apiFetch<{
        previous: { sourceId: string; label: string } | null;
        next: { sourceId: string; label: string } | null;
      }>(`/anime/sources/${sourceId}/navigation`),
    staleTime: 60000,
    retry: false,
  });
  const { change, busy } = useChangeRoomMovie(roomId, socket, engine);
  const [auto, setAuto] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const version = engine?.current?.version;
  React.useEffect(() => {
    const next = nav.data?.next;
    if (
      !auto ||
      !isHost ||
      !canControl ||
      !ended ||
      marathonActive ||
      !next ||
      !socket ||
      !engine ||
      version === undefined
    )
      return;
    let remaining = 10;
    setCountdown(remaining);
    const timer = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining > 0) return;
      clearInterval(timer);
      setCountdown(null);
      if (engine.current?.version !== version || engine.current.status !== 'ended') return;
      // No stale-command retry: only the same authoritative end state may advance.
      void socket
        .timeout(10000)
        .emitWithAck(SocketEvents.MOVIE_CHANGE, {
          roomId,
          commandId: crypto.randomUUID(),
          baseVersion: version,
          playbackSelection: { provider: 'anime', type: 'anime', sourceId: next.sourceId },
        })
        .catch(() => {});
    }, 1000);
    return () => {
      clearInterval(timer);
      setCountdown(null);
    };
  }, [auto, isHost, canControl, ended, marathonActive, nav.data, socket, engine, roomId, version]);
  if (marathonActive) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {(['previous', 'next'] as const).map((direction) => {
        const target = nav.data?.[direction];
        return (
          <Button
            key={direction}
            variant="secondary"
            disabled={!canControl || busy || !target}
            onClick={() => {
              if (target)
                void change(
                  selectionTitle({ provider: 'anime', type: 'anime', sourceId: target.sourceId }),
                );
            }}
          >
            {direction === 'next' ? 'Next episode' : 'Previous episode'}
          </Button>
        );
      })}
      {isHost && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Load next episode after ending
        </label>
      )}
      {countdown !== null && (
        <Button variant="ghost" onClick={() => setAuto(false)}>
          Next episode in {countdown}s · Cancel
        </Button>
      )}
      {nav.isError && (
        <span className="text-sm text-muted">Episode navigation is temporarily unavailable.</span>
      )}
    </div>
  );
}
