'use client';
import * as React from 'react';
import { VidsrcAdapter, VIDSRC_ORIGIN, type EmbedStatus } from '@/lib/sync/vidsrc-adapter';
import type { ExternalMedia } from '@jandi/shared';
import { Button } from '@/components/ui/button';
import { KisskhControlsTest } from './kisskh-controls-test';
import { describeEmbedMessage } from './embed-message-diagnostics';

export function EmbedControlsTest() {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);
  const [provider, setProvider] = React.useState<'vidsrc' | 'kisskh'>('vidsrc');
  if (!hydrated)
    return (
      <main className="mx-auto max-w-4xl p-4">
        <p data-testid="test-page-hydration">
          Loading test controls. JavaScript has not activated yet. Keep the dev server running;
          playback tests are unavailable until this message disappears.
        </p>
      </main>
    );
  return (
    <>
      <p
        data-testid="test-page-hydration"
        className="mx-auto max-w-4xl px-4 pt-4 text-sm text-muted"
      >
        Test controls ready · JavaScript is active
      </p>
      <div className="mx-auto max-w-4xl p-4">
        <label>
          Test provider{' '}
          <select
            aria-label="Test provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as 'vidsrc' | 'kisskh')}
          >
            <option value="vidsrc">VidSrc</option>
            <option value="kisskh">KissKH · Experimental</option>
          </select>
        </label>
      </div>
      {provider === 'vidsrc' ? <VidsrcControlsTest /> : <KisskhControlsTest />}
    </>
  );
}

function VidsrcControlsTest() {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const adapter = React.useRef<VidsrcAdapter | null>(null);
  const [manualProbe, setManualProbe] = React.useState(false);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [id, setId] = React.useState('155');
  const [type, setType] = React.useState<'movie' | 'tv'>('movie');
  const [season, setSeason] = React.useState('1');
  const [episode, setEpisode] = React.useState('1');
  const [media, setMedia] = React.useState<Exclude<ExternalMedia, { provider: 'anime' }>>({
    provider: 'vidsrc',
    type: 'movie',
    movieId: '00000000-0000-4000-8000-000000000000',
    tmdbId: 155,
  });
  const [elapsed, setElapsed] = React.useState(0);
  const [status, setStatus] = React.useState<EmbedStatus>('activation');
  const [logs, setLogs] = React.useState<string[]>([]);
  const log = (text: string) =>
    setLogs((items) => [`${new Date().toISOString()} ${text}`, ...items].slice(0, 30));
  React.useEffect(() => {
    if (!frame.current) return;
    const player = new VidsrcAdapter(frame.current, media);
    adapter.current = player;
    const started = Date.now();
    const receive = (event: MessageEvent) => {
      const summary = describeEmbedMessage(event, frame.current?.contentWindow ?? null);
      if (player.accept(event)) {
        log(
          `event: position=${player.currentTime.toFixed(1)} duration=${player.duration} paused=${player.paused} startupMs=${player.diagnostics.startupMs} events=${player.diagnostics.acceptedEvents}`,
        );
        setStatus(player.status);
      } else if (summary) {
        log(`ignored message: ${summary}`);
      }
    };
    window.addEventListener('message', receive);
    const timer = window.setInterval(() => {
      setStatus(player.status);
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => {
      player.destroy();
      window.removeEventListener('message', receive);
      window.clearInterval(timer);
    };
  }, [media]);
  const sendCommand = (action: 'play' | 'pause' | 'seek60') => {
    if (status !== 'ready' && !manualProbe) return;
    if (manualProbe) {
      frame.current?.contentWindow?.postMessage({ player: true, action }, VIDSRC_ORIGIN);
      log(`diagnostic command sent: ${action}; execution and playback remain unconfirmed`);
    } else {
      if (action === 'play') void adapter.current?.play();
      if (action === 'pause') adapter.current?.pause();
      if (action === 'seek60' && adapter.current) adapter.current.currentTime = 60;
      log(`sent: ${action}; awaiting playback events`);
    }
  };
  const path =
    media.type === 'movie'
      ? `movie/${media.tmdbId}`
      : `tv/${media.tvId}/${media.season}/${media.episode}`;
  return (
    <main className="mx-auto grid max-w-4xl gap-4 p-4">
      <h1>VidSrc control validation · Development only</h1>
      <p>
        Tap the provider’s play button first. A command log means sent, not acknowledged; verify the
        resulting events and video.
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setLogs([]);
          setManualProbe(false);
          setElapsed(0);
          setLoadAttempt((value) => value + 1);
          setStatus('activation');
          const tmdbId = Number(id);
          setMedia(
            type === 'movie'
              ? {
                  provider: 'vidsrc',
                  type,
                  tmdbId,
                  movieId: '00000000-0000-4000-8000-000000000000',
                }
              : {
                  provider: 'vidsrc',
                  type,
                  tmdbId,
                  tvId: tmdbId,
                  season: Number(season),
                  episode: Number(episode),
                },
          );
        }}
      >
        <label>
          Type{' '}
          <select value={type} onChange={(e) => setType(e.target.value as 'movie' | 'tv')}>
            <option value="movie">Movie</option>
            <option value="tv">TV</option>
          </select>
        </label>
        <label>
          TMDB ID{' '}
          <input
            required
            type="number"
            min="1"
            max="2147483647"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        {type === 'tv' && (
          <>
            <label>
              Season{' '}
              <input
                required
                type="number"
                min="0"
                max="1000"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              />
            </label>
            <label>
              Episode{' '}
              <input
                required
                type="number"
                min="1"
                max="10000"
                value={episode}
                onChange={(e) => setEpisode(e.target.value)}
              />
            </label>
          </>
        )}
        <Button type="submit">Load</Button>
      </form>
      <div className="relative aspect-video">
        <iframe
          key={`${path}-${loadAttempt}`}
          ref={frame}
          src={`https://vidsrc.sh/embed/${path}?autoplay=0&autonext=0`}
          onLoad={() => log('Iframe load event received; this does not confirm video playback.')}
          onError={() => {
            adapter.current?.fail();
            setStatus('failed');
            log('Iframe failed to load.');
          }}
          title="VidSrc validation player"
          className="absolute inset-0 size-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      <p role="status">
        Status: {status} · Test page active for {elapsed}s
      </p>
      {status === 'unknown' && (
        <p>
          No recent validated playback event. Check the diagnostics below; video playing alone does
          not prove the control API works.
        </p>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={manualProbe}
          onChange={(e) => setManualProbe(e.target.checked)}
        />
        Video is visibly playing — test commands without validated events (diagnostic only)
      </label>
      {manualProbe && (
        <p>
          Watch the video to check whether each command works. This does not confirm progress
          feedback or pass synchronization.
        </p>
      )}
      <div className="flex gap-3">
        <Button disabled={status !== 'ready' && !manualProbe} onClick={() => sendCommand('play')}>
          Play
        </Button>
        <Button disabled={status !== 'ready' && !manualProbe} onClick={() => sendCommand('pause')}>
          Pause
        </Button>
        <Button disabled={status !== 'ready' && !manualProbe} onClick={() => sendCommand('seek60')}>
          Seek to 60 seconds
        </Button>
      </div>
      <label className="grid gap-2">
        Player diagnostics — select and copy this text
        <textarea
          readOnly
          aria-label="Player diagnostics"
          className="h-48 w-full rounded border border-border-strong bg-secondary p-3 font-mono text-xs"
          value={logs.join('\n') || 'No player messages received yet.'}
        />
      </label>
    </main>
  );
}
