'use client';

import * as React from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from '@/components/player';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { PlaybackSource } from '@/lib/types';
import { useRoomSourceCapabilities } from '@/lib/queries/room-sources';
import type { RoomTvEpisode } from '@jandi/shared';

/** The embed controls remain local; changing the episode is the shared room action. */
export function KisskhRoomPlayer({
  src,
  title,
  overlay,
  episodeHref,
  episode,
  fullscreenAside,
  onFullscreenChange,
}: {
  src: string;
  title: string;
  overlay?: React.ReactNode;
  episodeHref?: string;
  episode: Extract<RoomTvEpisode, { provider: 'kisskh' | 'kisskh-direct' }>;
  fullscreenAside?: React.ReactNode;
  onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const [attempt, setAttempt] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const [useEmbed, setUseEmbed] = React.useState(false);
  const capabilities = useRoomSourceCapabilities();
  const playback = useQuery({
    queryKey: [
      'kisskh-solo-episode',
      episode.season,
      episode.episode,
      episode.seriesId,
      episode.episodeId,
    ],
    queryFn: () =>
      apiFetch<{ sources: PlaybackSource[] }>('/room-sources/kisskh/episode', {
        query: {
          season: episode.season,
          episode: episode.episode,
          seriesId: episode.seriesId,
          episodeId: episode.episodeId,
        },
      }),
    enabled: !!capabilities.data?.kisskhDirectSync && !useEmbed,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!useEmbed && capabilities.data?.kisskhDirectSync && playback.data?.sources.length) {
    return (
      <section aria-label={`KissKH room player: ${title}`}>
        <VideoPlayer
          sources={playback.data.sources}
          title={title}
          mode="solo"
          overlay={overlay}
          fullscreenAside={fullscreenAside}
          onFullscreenChange={onFullscreenChange}
          fullscreenFallback="viewport"
          onRetrySource={() => void playback.refetch()}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
          <p>Playback is individual. Focus the player for keyboard shortcuts.</p>
          <Button variant="secondary" size="sm" onClick={() => setUseEmbed(true)}>
            Use alternate player
          </Button>
        </div>
      </section>
    );
  }
  if (
    !useEmbed &&
    (capabilities.isLoading || (capabilities.data?.kisskhDirectSync && playback.isPending))
  ) {
    return (
      <div role="status" className="grid aspect-video place-items-center bg-black text-muted">
        Loading player…
      </div>
    );
  }
  return (
    <section aria-label={`KissKH room player: ${title}`}>
      <div className="relative aspect-video bg-black">
        <iframe
          key={`${src}-${attempt}`}
          src={src}
          title={`${title} KissKH player`}
          className="absolute inset-0 size-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFailed(true)}
        />
        <div className="pointer-events-none absolute inset-0">{overlay}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
        <p>
          The host chooses the episode for everyone. Play, pause and seeking are controlled
          individually.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          <RotateCw aria-hidden="true" />
          Reload my player
        </Button>
        {episodeHref && (
          <Link
            href={episodeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            Player blank? Open this episode separately
          </Link>
        )}
      </div>
      {failed && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          The KissKH player could not load. Reload it or ask the host to choose another source.
        </p>
      )}
    </section>
  );
}
