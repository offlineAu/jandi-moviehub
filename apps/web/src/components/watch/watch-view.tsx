'use client';

import { ArrowLeft, Ban, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { RequireAccount } from '@/components/layout/require-account';
import { Logo } from '@/components/layout/logo';
import { VideoPlayer, type VideoPlayerHandle } from '@/components/player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, isApiError } from '@/lib/api';
import { useMovie, usePlayback, useSeriesNavigation } from '@/lib/queries/catalog';
import { saveProgress, useLibraryStatus } from '@/lib/queries/library';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queries/keys';
import { cn, formatRuntime } from '@/lib/utils';
import { isExternalPlaybackEvent } from './external-player-events';
import { useRoomSourceCapabilities } from '@/lib/queries/room-sources';
import type { PlaybackSource } from '@/lib/types';

const SAVE_INTERVAL_MS = 10_000;

function useProgressSaver(
  movieId: string,
  playerRef: React.RefObject<VideoPlayerHandle | null>,
  ready: boolean,
) {
  const qc = useQueryClient();
  const lastSaved = React.useRef<number>(-1);
  const latest = React.useRef<{ position: number; duration: number }>({ position: 0, duration: 0 });

  const save = React.useCallback(
    (opts: { keepalive?: boolean } = {}) => {
      const { position, duration } = latest.current;
      if (position < 1 || Math.abs(position - lastSaved.current) < 1) return;
      lastSaved.current = position;
      saveProgress({ movieId, positionSec: position, durationSec: duration || undefined }, opts)
        .then(() => {
          if (!opts.keepalive) {
            void qc.invalidateQueries({ queryKey: qk.continueWatching });
            void qc.invalidateQueries({ queryKey: qk.historyAll });
          }
        })
        .catch(() => {
          // Allow the next tick to retry.
          lastSaved.current = -1;
        });
    },
    [movieId, qc],
  );

  const onTimeUpdate = React.useCallback((position: number, duration: number) => {
    latest.current = { position, duration };
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      const video = playerRef.current?.video;
      if (video && !video.paused) save();
    }, SAVE_INTERVAL_MS);
    const video = playerRef.current?.video;
    const onPause = () => save();
    const onEnded = () => save();
    video?.addEventListener('pause', onPause);
    video?.addEventListener('ended', onEnded);
    const onHide = () => {
      if (document.visibilityState === 'hidden') save({ keepalive: true });
    };
    const onPageHide = () => save({ keepalive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(interval);
      video?.removeEventListener('pause', onPause);
      video?.removeEventListener('ended', onEnded);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      save({ keepalive: true });
    };
  }, [ready, playerRef, save]);

  return onTimeUpdate;
}

function Watch({ id }: { id: string }) {
  const router = useRouter();
  const movie = useMovie(id);
  const playback = usePlayback(id);
  const capabilities = useRoomSourceCapabilities();
  const direct = useQuery({
    queryKey: ['kisskh-solo-movie', id],
    queryFn: () =>
      apiFetch<{ sources: PlaybackSource[] }>(
        `/room-sources/kisskh/movie/${encodeURIComponent(id)}`,
      ),
    enabled:
      !!capabilities.data?.kisskhDirectSync &&
      playback.isError &&
      isApiError(playback.error) &&
      playback.error.code === 'NOT_PLAYABLE',
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const external = useQuery({
    queryKey: ['external-source', id],
    queryFn: () =>
      apiFetch<{ available: boolean; embedUrl: string | null }>(
        `/movies/${encodeURIComponent(id)}/external-source`,
      ),
    enabled:
      playback.isError &&
      isApiError(playback.error) &&
      playback.error.code === 'NOT_PLAYABLE' &&
      (!capabilities.data?.kisskhDirectSync || direct.isError),
    staleTime: 300000,
    retry: false,
  });
  const status = useLibraryStatus(id);
  const navigation = useSeriesNavigation(id);
  const playerRef = React.useRef<VideoPlayerHandle>(null);
  const [theater, setTheater] = React.useState(false);
  const [externalAttempt, setExternalAttempt] = React.useState(0);
  const [externalStarted, setExternalStarted] = React.useState(false);
  const externalFrame = React.useRef<HTMLIFrameElement>(null);
  const sources = playback.data?.sources ?? direct.data?.sources;
  const previousEpisode = navigation.data?.navigation?.previous;
  const nextEpisode = navigation.data?.navigation?.next;
  const ready = !!sources?.length && !status.isLoading;
  const onTimeUpdate = useProgressSaver(id, playerRef, ready);

  const progress = status.data?.progress;
  const startAt =
    progress && !progress.completed && progress.positionSec >= 5 ? progress.positionSec : 0;
  const title = movie.data?.title ?? 'Movie';

  React.useEffect(() => {
    if (movie.data) document.title = `Watching ${movie.data.title} · Jandi MovieHub`;
  }, [movie.data]);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (isExternalPlaybackEvent(event, externalFrame.current?.contentWindow ?? null))
        setExternalStarted(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  let stage: React.ReactNode;
  if (playback.isLoading || status.isLoading) {
    stage = <Skeleton className="aspect-video w-full rounded-2xl" />;
  } else if (playback.isError && direct.isFetching) {
    stage = <Skeleton className="aspect-video w-full rounded-2xl" />;
  } else if (playback.isError && direct.data?.sources.length) {
    stage = (
      <VideoPlayer
        ref={playerRef}
        sources={direct.data.sources}
        title={title}
        mode="solo"
        startAtSec={startAt}
        autoPlay
        onTimeUpdate={onTimeUpdate}
        onRetrySource={() => void direct.refetch()}
      />
    );
  } else if (playback.isError) {
    const notPlayable =
      isApiError(playback.error) &&
      (playback.error.code === 'NOT_PLAYABLE' || playback.error.status === 404);
    stage =
      notPlayable && external.isLoading ? (
        <Skeleton className="aspect-video w-full rounded-2xl" />
      ) : notPlayable && external.data?.available && external.data.embedUrl ? (
        <div>
          <div className="aspect-video overflow-hidden rounded-2xl bg-black">
            <iframe
              key={externalAttempt}
              ref={externalFrame}
              src={external.data.embedUrl}
              title={`Third-party player: ${title}`}
              className="size-full"
              allow="fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 px-4 sm:px-0">
            <Button
              variant="secondary"
              onClick={() => {
                setExternalStarted(false);
                setExternalAttempt((attempt) => attempt + 1);
              }}
            >
              Reload player
            </Button>
            <span className="text-sm text-muted">
              {externalStarted
                ? 'The third-party player reported playback.'
                : 'Source listed; playback has not been confirmed. The movie may be unavailable.'}
            </span>
          </div>
        </div>
      ) : notPlayable ? (
        <EmptyState
          icon={Ban}
          className="aspect-video"
          title="Not available to stream"
          description="We have details for this title but no license to play it. Pick another movie, or check back later."
          action={
            <Button asChild variant="secondary">
              <Link href={`/movies/${id}`}>Back to details</Link>
            </Button>
          }
        />
      ) : (
        <ErrorState
          className="aspect-video"
          title="The stream didn’t load"
          error={playback.error}
          onRetry={() => void playback.refetch()}
          retrying={playback.isFetching}
        />
      );
  } else if (sources?.length) {
    stage = (
      <VideoPlayer
        ref={playerRef}
        sources={sources}
        title={title}
        mode="solo"
        startAtSec={startAt}
        autoPlay
        onTimeUpdate={onTimeUpdate}
        onPrevious={
          previousEpisode?.playable
            ? () => router.push(`/watch/${previousEpisode.movieId}`)
            : undefined
        }
        onNext={
          nextEpisode?.playable ? () => router.push(`/watch/${nextEpisode.movieId}`) : undefined
        }
        theater={theater}
        onTheaterChange={setTheater}
        className={theater ? 'rounded-none sm:rounded-none' : undefined}
      />
    );
  } else {
    stage = (
      <EmptyState
        icon={Ban}
        className="aspect-video"
        title="No playable sources"
        description="This title has no streams right now."
      />
    );
  }

  const license = sources?.[0]?.license;
  const m = movie.data;

  return (
    <>
      <div
        className={cn(
          'mx-auto w-full transition-[max-width] duration-300',
          theater ? 'max-w-none' : 'max-w-6xl px-0 sm:px-6',
        )}
      >
        {stage}
      </div>
      <div className="mx-auto mt-6 w-full max-w-6xl px-4 sm:px-6">
        {m ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {m.title}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {m.year ? <span>{m.year}</span> : null}
                {formatRuntime(m.runtimeMin) ? <span>{formatRuntime(m.runtimeMin)}</span> : null}
                {m.genres.slice(0, 3).map((g) => (
                  <span key={g}>{g}</span>
                ))}
                {m.isDemo ? <Badge variant="demo">Demo</Badge> : null}
              </p>
              {startAt > 0 ? (
                <p className="mt-2 text-sm text-foreground/80">Resuming where you left off.</p>
              ) : null}
            </div>
            <Button asChild variant="outline">
              <Link href={`/rooms/new?movieId=${id}`}>
                <Users aria-hidden="true" />
                Watch together
              </Link>
            </Button>
          </div>
        ) : movie.isLoading ? (
          <Skeleton className="h-9 w-72" />
        ) : null}
        {license?.attribution ? (
          <p className="mt-6 text-xs text-muted">{license.attribution}</p>
        ) : null}
        {navigation.data?.navigation && (
          <nav aria-label="Series episodes" className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary">
              <Link href={`/series/${navigation.data.navigation.series.id}`}>All episodes</Link>
            </Button>
            {navigation.data.navigation.previous?.playable && (
              <Button asChild variant="secondary">
                <Link href={`/watch/${navigation.data.navigation.previous.movieId}`}>
                  Previous episode
                </Link>
              </Button>
            )}
            {navigation.data.navigation.next?.playable ? (
              <Button asChild variant="secondary">
                <Link href={`/watch/${navigation.data.navigation.next.movieId}`}>Next episode</Link>
              </Button>
            ) : (
              navigation.data.navigation.next && (
                <span className="text-sm text-muted">Next episode is not available to watch.</span>
              )
            )}
          </nav>
        )}
        <details className="mt-6 max-w-xl text-sm text-muted">
          <summary className="cursor-pointer rounded font-medium text-foreground/80 focus-ring">
            Keyboard shortcuts
          </summary>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            {[
              ['Space or K', 'Play / pause'],
              ['J / L', 'Back / forward 10 seconds'],
              ['← / →', 'Back / forward 5 seconds'],
              ['↑ / ↓', 'Volume up / down'],
              ['M', 'Mute'],
              ['F', 'Full screen'],
              ['C', 'Captions'],
              ['T', 'Theater mode'],
            ].map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>
                  <kbd className="rounded border border-border-strong bg-surface px-1.5 py-0.5 font-sans text-xs text-foreground">
                    {k}
                  </kbd>
                </dt>
                <dd>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </details>
      </div>
    </>
  );
}

export function WatchView({ id }: { id: string }) {
  return (
    <div className="min-h-dvh bg-black/40">
      <header className="flex h-16 items-center gap-4 px-4 sm:px-6">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/movies/${id}`}>
            <ArrowLeft aria-hidden="true" />
            Details
          </Link>
        </Button>
        <div className="ml-auto">
          <Logo />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="pb-16 outline-none">
        <RequireAccount feature="Streaming">{() => <Watch id={id} />}</RequireAccount>
      </main>
    </div>
  );
}
