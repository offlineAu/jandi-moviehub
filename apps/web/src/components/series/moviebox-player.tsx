'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, isApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { NativeSelect } from '@/components/ui/native-select';

type Session = {
  audioLanguage: 'es';
  sources: { id: string; url: string; resolution: number }[];
  englishVtt: string | null;
  subtitleStatus: 'AVAILABLE' | 'UNAVAILABLE';
};
export function MovieboxPlayer({
  id,
  season,
  episode,
  numbering,
}: {
  id: string;
  season: string;
  episode: string;
  numbering?: 'provider';
}) {
  const needsSource = !numbering && id === '71446' && season === '1';
  const [part, setPart] = React.useState(1);
  const [sourceEpisode, setSourceEpisode] = React.useState('');
  const selection = needsSource ? (
    <div className="mb-4 grid gap-3 rounded-2xl bg-white/[0.03] p-4">
      <p className="text-sm text-muted">
        Season 1 has different cuts: this catalog has 15 episodes, while MovieBox splits them into
        Parts 1 and 2. Choose the source episode you want to watch.
      </p>
      <div className="flex flex-wrap gap-3">
        <NativeSelect
          aria-label="MovieBox source part"
          value={part}
          onChange={(event) => {
            setPart(Number(event.target.value));
            setSourceEpisode('');
          }}
        >
          <option value="1">Part 1 · 13 episodes</option>
          <option value="2">Part 2 · 9 episodes</option>
        </NativeSelect>
        <NativeSelect
          aria-label="MovieBox source episode"
          value={sourceEpisode}
          onChange={(event) => setSourceEpisode(event.target.value)}
        >
          <option value="">Choose a source episode</option>
          {Array.from({ length: part === 1 ? 13 : 9 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              Episode {index + 1}
            </option>
          ))}
        </NativeSelect>
      </div>
      {sourceEpisode && (
        <p className="text-sm">
          Selected source: Part {part}, Episode {sourceEpisode}. The catalog title below uses the
          original cut.
        </p>
      )}
    </div>
  ) : null;
  return (
    <>
      {selection}
      {needsSource && !sourceEpisode ? (
        <div
          role="status"
          className="grid aspect-video place-items-center rounded-2xl bg-black p-6 text-center text-muted"
        >
          Choose a MovieBox source episode above to start playback.
        </div>
      ) : (
        <MovieboxVideo
          key={`${id}-${season}-${episode}-${part}-${sourceEpisode}`}
          id={id}
          season={season}
          episode={episode}
          source={
            numbering
              ? { numbering }
              : needsSource
                ? { sourcePart: part, sourceEpisode: Number(sourceEpisode) }
                : undefined
          }
        />
      )}
    </>
  );
}

function MovieboxVideo({
  id,
  season,
  episode,
  source: sourceSelection,
}: {
  id: string;
  season: string;
  episode: string;
  source?: { sourcePart: number; sourceEpisode: number } | { numbering: 'provider' };
}) {
  const playback = useQuery({
    queryKey: ['moviebox-playback', id, season, episode, sourceSelection],
    queryFn: () =>
      apiFetch<Session>('/moviebox/playback', {
        query: { tvId: id, season, episode, ...sourceSelection },
      }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [failed, setFailed] = React.useState(false);
  const [captionUrl, setCaptionUrl] = React.useState<string | null>(null);
  const video = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    setFailed(false);
    const text = playback.data?.englishVtt;
    if (!text) {
      setCaptionUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
    setCaptionUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [playback.data]);
  const enableCaptions = () => {
    const track = video.current?.textTracks[0];
    if (track) track.mode = 'showing';
  };
  if (playback.isPending || playback.isFetching)
    return (
      <div className="grid aspect-video place-items-center rounded-2xl bg-black text-muted">
        Loading original Spanish audio and English subtitles…
      </div>
    );
  if (playback.isError)
    return (
      <ErrorState
        error={
          isApiError(playback.error) &&
          playback.error.status === 404 &&
          playback.error.message.startsWith('Cannot GET ')
            ? new Error(
                'The running Jandi API does not have this playback route. Restart the API with the latest build, then try again.',
              )
            : playback.error
        }
        onRetry={() => void playback.refetch()}
      />
    );
  const source = playback.data.sources[0];
  if (!source) return <p>No free MP4 source is available for this episode.</p>;
  return (
    <section aria-label="MovieBox original audio player">
      <video
        key={source.url}
        ref={video}
        src={source.url}
        controls
        playsInline
        autoPlay
        preload="metadata"
        aria-label="Original Spanish audio"
        className="aspect-video w-full rounded-2xl bg-black"
        onError={() => setFailed(true)}
        onLoadedMetadata={enableCaptions}
      >
        {captionUrl && (
          <track
            src={captionUrl}
            kind="subtitles"
            srcLang="en"
            label="English"
            default
            onLoad={enableCaptions}
          />
        )}
      </video>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          Original Spanish audio · {source.resolution}p ·{' '}
          {captionUrl ? 'English subtitles' : 'English subtitles unavailable'}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void playback.refetch()}>
          Refresh video and subtitles
        </Button>
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-muted">
          The video could not be loaded. Its link may have expired or the provider may block
          playback from this site. Refresh the source or choose KissKH.
        </p>
      )}
      {!captionUrl && (
        <p className="mt-3 text-sm text-muted">
          The provider did not return usable English captions for this MP4. Playback has not been
          verified with subtitles.
        </p>
      )}
    </section>
  );
}
