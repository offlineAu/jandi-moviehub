'use client';
import { RequireAccount } from '@/components/layout/require-account';
import * as React from 'react';
import Link from 'next/link';
import { VideoPlayer } from '@/components/player/video-player';
import { Button } from '@/components/ui/button';
import { useAnimeEpisodes, useAnimePlayback } from '@/lib/queries/anime';
import { apiFetch, errorMessage } from '@/lib/api';
import { selectionTitle } from '@jandi/shared';
import { nextAnimeSource } from './anime-source-recovery';

function AnimeWatchContent({ id }: { id: string }) {
  const catalog = useAnimeEpisodes(id);
  const [episodeId, setEpisodeId] = React.useState('');
  const [sourceId, setSourceId] = React.useState('');
  const [failed, setFailed] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState('');
  const selected = catalog.data?.episodes.find((e) => e.id === episodeId);
  const playback = useAnimePlayback(sourceId);
  const started = React.useRef(new Set<string>());
  const position = React.useRef(0);
  const [resumeAt, setResumeAt] = React.useState(0);
  const lastPosition = React.useRef(0);
  const report = React.useCallback(
    (event: 'started' | 'failed') => {
      const device = /iPhone|iPad|iPod/.test(navigator.userAgent)
        ? 'ios'
        : /Android/.test(navigator.userAgent)
          ? 'android'
          : 'desktop';
      void apiFetch(`/anime/sources/${sourceId}/events`, {
        method: 'POST',
        body: { event, device },
      }).catch(() => {});
    },
    [sourceId],
  );
  const recover = React.useCallback(() => {
    if (!selected || failed.includes(sourceId)) return;
    report('failed');
    const attempts = [...failed, sourceId];
    setFailed(attempts);
    const next = nextAnimeSource(selected.sources, sourceId, attempts);
    if (next) {
      setResumeAt(position.current);
      lastPosition.current = position.current;
      setSourceId(next.id);
      setMessage('Trying another source for this edition…');
    } else setMessage('This source is unavailable. Choose another source below or try again.');
  }, [selected, failed, sourceId, report]);
  React.useEffect(() => {
    if (playback.data && ['missing', 'unavailable'].includes(playback.data.status)) recover();
  }, [playback.data, recover]);
  React.useEffect(() => {
    if (playback.isError) recover();
  }, [playback.isError, recover]);
  const choose = (episode: string, source: string) => {
    position.current = 0;
    lastPosition.current = 0;
    setResumeAt(0);
    setEpisodeId(episode);
    setSourceId(source);
    setFailed([]);
    setMessage('');
  };
  const index = catalog.data?.episodes.findIndex((e) => e.id === episodeId) ?? -1;
  const adjacent = (offset: number) => {
    const episode = catalog.data?.episodes[index + offset];
    const current = selected?.sources.find((s) => s.id === sourceId);
    const source = episode?.sources.find(
      (s) => s.adapterId === current?.adapterId && s.audioLanguage === current?.audioLanguage,
    );
    return episode && source ? { episode, source } : null;
  };
  const previous = index >= 0 ? adjacent(-1) : null;
  const next = index >= 0 ? adjacent(1) : null;
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <Link href="/anime">← Anime</Link>
      <h1 className="text-3xl font-semibold">{catalog.data?.title.title ?? 'Anime'}</h1>
      {catalog.isError && <p role="alert">{errorMessage(catalog.error)}</p>}
      {sourceId && (playback.isPending || playback.data?.status === 'pending') && (
        <p role="status">Preparing your stream. A sleeping service may take up to 90 seconds.</p>
      )}
      {playback.isError && <p role="alert">{errorMessage(playback.error)}</p>}
      {message && <p role="status">{message}</p>}
      {playback.data?.status === 'ready' && (
        <VideoPlayer
          key={sourceId}
          sources={playback.data.sources}
          title={playback.data.movie.title}
          mode="solo"
          startAtSec={resumeAt}
          onPrevious={previous ? () => choose(previous.episode.id, previous.source.id) : undefined}
          onNext={next ? () => choose(next.episode.id, next.source.id) : undefined}
          onPlaybackErrorChange={(error) => {
            if (error) recover();
          }}
          onTimeUpdate={(seconds) => {
            const advanced = seconds > lastPosition.current + 0.1;
            lastPosition.current = seconds;
            position.current = seconds;
            if (advanced && !started.current.has(sourceId)) {
              started.current.add(sourceId);
              report('started');
              setMessage('');
            }
          }}
        />
      )}
      {sourceId && (
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setFailed([]);
              void playback.refetch();
            }}
          >
            Try again
          </Button>
          <Button asChild>
            <Link
              href={`/rooms/new?movieId=${encodeURIComponent(selectionTitle({ provider: 'anime', type: 'anime', sourceId }))}`}
            >
              Watch Together
            </Link>
          </Button>
        </div>
      )}
      <h2 className="text-xl font-medium">Episodes</h2>
      {catalog.isPending && <p role="status">Loading episodes…</p>}
      {catalog.data?.episodes.length === 0 && (
        <p>Episode mappings are not available for this title yet.</p>
      )}
      <div className="grid gap-3">
        {catalog.data?.episodes.map((e) => (
          <section key={e.id} className="rounded-xl border border-border p-4">
            <h3>{e.label}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {e.sources.map((s) => (
                <Button
                  key={s.id}
                  variant={sourceId === s.id ? 'primary' : 'secondary'}
                  onClick={() => choose(e.id, s.id)}
                >
                  {s.audioLanguage} · {s.subtitleLanguage ?? 'Subtitles unconfirmed'} ·{' '}
                  {s.adapterId}
                </Button>
              ))}
              {!e.sources.length && <span className="text-muted">No verified source yet</span>}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export function AnimeWatch({ id }: { id: string }) {
  return <RequireAccount feature="Streaming">{() => <AnimeWatchContent id={id} />}</RequireAccount>;
}
