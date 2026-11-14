'use client';

import { useQuery } from '@tanstack/react-query';
import { selectionTitle, type ExternalMedia } from '@jandi/shared';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useRoomSourceCapabilities } from '@/lib/queries/room-sources';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import { useChangeRoomMovie } from './room-dialogs';

/** Only a host can propose another candidate; switching uses the existing versioned command. */
export function RoomSourceRecovery({
  media,
  roomId,
  socket,
  engine,
}: {
  media: Extract<ExternalMedia, { type: 'movie' }>;
  roomId: string;
  socket: Socket | null;
  engine: RoomSyncEngine | null;
}) {
  const capabilities = useRoomSourceCapabilities();
  const { change, busy } = useChangeRoomMovie(roomId, socket, engine);
  const candidates = useQuery({
    queryKey: ['playback-candidates', media.movieId],
    queryFn: () =>
      apiFetch<{
        candidates: Array<{
          provider: 'local' | 'kisskh-direct' | 'vidsrc';
          state: string;
          roomControls: string;
        }>;
      }>(`/room-sources/candidates/movie/${encodeURIComponent(media.movieId)}`),
    enabled: !!capabilities.data?.playbackPipeline,
    retry: false,
  });
  const alternatives =
    candidates.data?.candidates.filter(
      (candidate) =>
        candidate.state === 'listed' &&
        candidate.roomControls !== 'none' &&
        candidate.provider !== media.provider,
    ) ?? [];
  if (!capabilities.data?.playbackPipeline) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      {candidates.isFetching ? (
        <span>Checking alternatives…</span>
      ) : candidates.isError ? (
        <span>Couldn’t check alternative sources.</span>
      ) : alternatives.length ? (
        <>
          <span>Changing the source restarts the movie for everyone; timing and device support may differ.</span>
          {alternatives.map((candidate) => {
            const title =
              candidate.provider === 'local'
                ? media.movieId
                : selectionTitle({
                    provider: candidate.provider,
                    type: 'movie',
                    movieId: media.movieId,
                  });
            return (
              <Button
                key={candidate.provider}
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void change(title, 'Source changed for everyone')}
              >
                Use{' '}
                {candidate.provider === 'local'
                  ? 'local source'
                  : candidate.provider === 'vidsrc'
                    ? 'VidSrc'
                    : 'KissKH'}
              </Button>
            );
          })}
        </>
      ) : (
        <span>No other synchronized source is currently listed.</span>
      )}
    </div>
  );
}
