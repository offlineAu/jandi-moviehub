'use client';

import * as React from 'react';
import { providerEpisode } from '@jandi/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Maximize, Play, RotateCw, Users } from 'lucide-react';
import { LogoMark } from '@/components/layout/logo';
import { Artwork } from '@/components/movies/artwork';
import { VideoPlayer } from '@/components/player';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { apiFetch } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';
import { useRoomSourceCapabilities } from '@/lib/queries/room-sources';
import type { PlaybackSource } from '@/lib/types';
import { ExternalEpisodes } from './external-episodes';
import { MovieboxPlayer } from './moviebox-player';

export function TvPlayback({
  id,
  season,
  episode,
  title,
  seriesTitle,
  still,
  belowPlayer,
}: {
  id: string;
  season: string;
  episode: string;
  title: string;
  seriesTitle: string;
  still: string | null;
  /** Rendered directly under the player (episode title, prev/next). */
  belowPlayer?: React.ReactNode;
}) {
  const [provider, setProvider] = React.useState<'moviebox' | 'kisskh'>('kisskh');
  const [nativeFailed, setNativeFailed] = React.useState(false);
  const [alternatePlayer, setAlternatePlayer] = React.useState(false);
  const capabilities = useRoomSourceCapabilities();
  React.useEffect(() => {
    setNativeFailed(false);
    setAlternatePlayer(false);
  }, [id, season, episode]);
  const candidates = useQuery({
    queryKey: ['episode-playback-candidates', id, season, episode],
    queryFn: () =>
      apiFetch<{ candidates: Array<{ provider: string; state: string }> }>(
        '/room-sources/candidates/episode',
        { query: { tvId: id, season, episode } },
      ),
    enabled: !!capabilities.data?.playbackPipeline && nativeFailed,
    retry: false,
  });
  const sourceEpisode = providerEpisode(id, Number(season), Number(episode));
  const [externalPlayer, setExternalPlayer] = React.useState<{ id: number; title: string } | null>(
    null,
  );
  const [externalStatus, setExternalStatus] = React.useState('Finding an episode source…');
  const [playerAttempt, setPlayerAttempt] = React.useState(0);
  const [fullscreenError, setFullscreenError] = React.useState(false);
  const externalContainer = React.useRef<HTMLDivElement>(null);
  const enterFullscreen = async () => {
    try {
      if (!externalContainer.current?.requestFullscreen) throw new Error('Fullscreen unavailable');
      await externalContainer.current.requestFullscreen();
      setFullscreenError(false);
    } catch {
      setFullscreenError(true);
    }
  };
  const path = `/tv/${encodeURIComponent(id)}/seasons/${encodeURIComponent(season)}/episodes/${encodeURIComponent(episode)}`;
  const me = useMe();
  const availability = useQuery({
    queryKey: ['tv-playable', id, season, episode],
    queryFn: () => apiFetch<{ playable: boolean; movieId?: string | null }>(`${path}/availability`),
    retry: false,
  });
  const playback = useQuery({
    queryKey: ['tv-playback', id, season, episode],
    queryFn: () => apiFetch<{ sources: PlaybackSource[] }>(`${path}/playback`),
    enabled: availability.data?.playable === true && !!me.data && !me.data.isGuest,
    retry: false,
    staleTime: 0,
  });
  if (availability.data?.playable && playback.data?.sources.length && !nativeFailed)
    return (
      <>
        <div className="overflow-hidden rounded-2xl shadow-[0_40px_120px_-40px_rgb(168_85_247/0.35)] ring-1 ring-white/10">
          <VideoPlayer
            sources={playback.data.sources}
            title={title}
            mode="solo"
            autoPlay
            onPlaybackErrorChange={setNativeFailed}
          />
        </div>
        {availability.data.movieId ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-glass-1 px-4 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
            <p className="text-sm text-muted">
              Watch this episode in sync with friends — the host can move the room to the next
              episode.
            </p>
            <Button asChild size="sm">
              <Link href={`/rooms/new?movieId=${encodeURIComponent(availability.data.movieId)}`}>
                <Users aria-hidden="true" />
                Watch together
              </Link>
            </Button>
          </div>
        ) : null}
        {belowPlayer}
      </>
    );
  if (nativeFailed && candidates.isLoading)
    return (
      <div className="grid aspect-video place-items-center bg-black text-sm text-muted">
        Finding another player…
      </div>
    );
  if (
    nativeFailed &&
    candidates.data?.candidates.some(
      (candidate) => candidate.provider === 'vidsrc' && candidate.state === 'listed',
    )
  )
    return (
      <>
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            className="size-full"
            src={`https://vidsrc.sh/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`}
            title={`Third-party player: ${title}`}
            allow="fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {belowPlayer}
      </>
    );
  return (
    <>
      {id === '71446' && (
        <div className="mb-4 max-w-xs">
          <NativeSelect
            aria-label="Playback provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as 'moviebox' | 'kisskh')}
          >
            <option value="kisskh">KissKH</option>
            <option value="moviebox">MovieBox · Original Spanish</option>
          </NativeSelect>
        </div>
      )}
      {provider === 'kisskh' && !alternatePlayer && !availability.data?.playable && (
        <ExternalEpisodes
          key={`${id}-${season}-${episode}`}
          title={seriesTitle}
          season={sourceEpisode.season}
          episode={sourceEpisode.episode}
          requireSourceSelection={id === '71446' && season === '1'}
          onPlayerChange={setExternalPlayer}
          onStatusChange={setExternalStatus}
        />
      )}
      {provider === 'moviebox' ? (
        <MovieboxPlayer
          key={`${id}-${season}-${episode}`}
          id={id}
          season={season}
          episode={episode}
        />
      ) : (
        <>
          {alternatePlayer ? (
            <div className="aspect-video overflow-hidden rounded-2xl bg-black">
              <iframe
                className="size-full"
                src={`https://vidsrc.sh/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`}
                title={`Alternative third-party player: ${title}`}
                allow="fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : externalPlayer && !availability.data?.playable ? (
            <div>
              <div
                ref={externalContainer}
                className="aspect-video overflow-hidden rounded-2xl bg-black shadow-[0_40px_120px_-40px_rgb(168_85_247/0.35)] ring-1 ring-white/10"
              >
                <iframe
                  key={`${externalPlayer.id}-${playerAttempt}`}
                  className="size-full"
                  src={`https://kisskh.megaplay.su/kisskh/${externalPlayer.id}`}
                  title={`${externalPlayer.title} third-party player`}
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-glass-1 px-4 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  Third-party player. If it shows an error, the source may be down — reload or try
                  later.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void enterFullscreen()}>
                    <Maximize aria-hidden="true" /> Full screen
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPlayerAttempt((attempt) => attempt + 1)}
                  >
                    <RotateCw aria-hidden="true" />
                    Reload player
                  </Button>
                </div>
              </div>
              {fullscreenError && (
                <p role="status" className="mt-2 text-sm text-muted">
                  Full screen is unavailable here. Try the full-screen control inside the player.
                </p>
              )}
              <p className="mt-3 text-sm text-muted">
                Use the player’s CC menu for subtitles and its settings menu for audio languages, if
                available. Dubbed audio depends on the episode source.
              </p>
            </div>
          ) : (
            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-black p-6 text-center ring-1 ring-white/10">
              {still && (
                <>
                  <Artwork
                    src={still}
                    alt=""
                    sizes="100vw"
                    kind="backdrop"
                    className="scale-105 blur-[2px]"
                  />
                  <div className="absolute inset-0 bg-[radial-gradient(70%_70%_at_50%_50%,rgb(8_8_16/0.6),rgb(8_8_16/0.92))]" />
                </>
              )}
              <div className="relative grid max-w-md justify-items-center gap-4 text-white">
                {availability.isLoading ||
                (availability.data?.playable && me.isLoading) ||
                (playback.isLoading && availability.data?.playable && me.data) ? (
                  <>
                    <LogoMark animate="loop" className="size-12" />
                    <p className="text-sm text-white/80">Checking playback…</p>
                  </>
                ) : availability.isError ? (
                  <>
                    <p>Couldn’t check episode availability.</p>
                    <Button variant="secondary" onClick={() => void availability.refetch()}>
                      <RotateCw aria-hidden="true" />
                      Try again
                    </Button>
                  </>
                ) : !availability.data?.playable ? (
                  <>
                    <LogoMark animate="loop" className="size-12" />
                    <p className="text-sm text-white/80">{externalStatus}</p>
                  </>
                ) : !me.data || me.data.isGuest ? (
                  <>
                    <p className="text-lg font-semibold">Sign in to watch this episode</p>
                    <Button asChild size="lg">
                      <Link
                        href={`/login?next=${encodeURIComponent(`/watch/tv/${id}/season/${season}/episode/${episode}`)}`}
                      >
                        <Play className="fill-current" aria-hidden="true" />
                        Sign in
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p>Playback could not be started. The source may no longer be available.</p>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setNativeFailed(false);
                        void playback.refetch();
                      }}
                    >
                      <RotateCw aria-hidden="true" />
                      Try again
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {provider === 'kisskh' && !availability.data?.playable && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAlternatePlayer((value) => !value)}
          >
            {alternatePlayer ? 'Return to original player' : 'Try another player'}
          </Button>
          <p className="text-sm text-muted">
            Availability and episode numbering may differ between players.
          </p>
        </div>
      )}
      {belowPlayer}
    </>
  );
}
