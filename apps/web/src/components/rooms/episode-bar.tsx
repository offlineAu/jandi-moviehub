'use client';

import type { PlaybackStatus } from '@jandi/shared';
import { ChevronLeft, ChevronRight, Tv } from 'lucide-react';
import Link from 'next/link';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { useSeriesNavigation, type EpisodeLink } from '@/lib/queries/catalog';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import { cn } from '@/lib/utils';
import { useChangeRoomMovie } from './room-dialogs';

const label = (e: { seasonNumber: number; episodeNumber: number }) =>
  `S${e.seasonNumber} E${e.episodeNumber}`;

/**
 * Shown under the room player when the current title is a series episode: where we are in the
 * show, and (for anyone who can control playback) previous/next episode for the whole room.
 * During an active marathon the server owns progression, so the controls are hidden.
 */
export function EpisodeBar({
  roomId,
  movieId,
  status,
  socket,
  engine,
  canControl,
  marathonActive,
  className,
}: {
  roomId: string;
  movieId: string | null;
  status: PlaybackStatus | undefined;
  socket: Socket | null;
  engine: RoomSyncEngine | null;
  canControl: boolean;
  marathonActive: boolean;
  className?: string;
}) {
  const navigation = useSeriesNavigation(movieId);
  const { change, busy } = useChangeRoomMovie(roomId, socket, engine);
  const nav = navigation.data?.navigation;
  if (!nav) return null;

  const showHref =
    nav.kind === 'tv'
      ? `/tv/${encodeURIComponent(nav.series.id)}`
      : `/series/${encodeURIComponent(nav.series.id)}`;
  const controls = canControl && !marathonActive;
  const ended = status === 'ended';

  const step = (to: EpisodeLink | null, dir: 'prev' | 'next') => {
    const word = dir === 'prev' ? 'Previous' : 'Next';
    if (!to) return null;
    const content = (
      <>
        {dir === 'prev' ? <ChevronLeft aria-hidden="true" /> : null}
        {word}
        <span className="text-xs font-normal opacity-75">{label(to)}</span>
        {dir === 'next' ? <ChevronRight aria-hidden="true" /> : null}
      </>
    );
    return (
      <Button
        size="sm"
        variant={dir === 'next' && ended ? 'primary' : 'secondary'}
        disabled={!to.playable || busy}
        title={to.playable ? to.title : 'This episode isn’t available to stream'}
        aria-label={
          to.playable
            ? `${word} episode for everyone: ${label(to)}, ${to.title}`
            : `${word} episode ${label(to)} is unavailable`
        }
        onClick={() => void change(to.movieId, `Now playing ${label(to)} for everyone`)}
      >
        {content}
      </Button>
    );
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-glass-1 px-4 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]',
        className,
      )}
    >
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <Tv className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <Link href={showHref} className="truncate font-medium hover:underline">
          {nav.series.title}
        </Link>
        <span className="shrink-0 text-muted">· {label(nav.current)}</span>
      </p>
      {controls ? (
        <nav aria-label="Episode navigation" className="flex shrink-0 gap-2">
          {step(nav.previous, 'prev')}
          {step(nav.next, 'next')}
        </nav>
      ) : nav.next && !marathonActive ? (
        <p className="text-xs text-muted">Up next: {label(nav.next)}</p>
      ) : null}
    </div>
  );
}
