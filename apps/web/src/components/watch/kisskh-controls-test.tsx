'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export const KISSKH_ORIGIN = 'https://kisskh.megaplay.su';

/** Listen only to the active provider frame; never capture its URLs or arbitrary data. */
export function kisskhEventSummary(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  frame: Window | null,
): string | null {
  if (!frame || event.source !== frame || event.origin !== KISSKH_ORIGIN) return null;
  let payload: unknown = event.data;
  if (typeof payload === 'string') {
    if (payload.length > 10000) return null;
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  const finite = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400
      ? value
      : undefined;
  if (data.type === 'watching-log')
    return JSON.stringify({
      event: 'watching-log',
      currentTime: finite(data.currentTime),
      duration: finite(data.duration),
    });
  if (data.channel === 'kisskh' && ['time', 'complete', 'error'].includes(String(data.event))) {
    return JSON.stringify({
      event: data.event,
      currentTime: finite(data.currentTime),
      duration: finite(data.duration),
      position: finite(data.time),
    });
  }
  return null;
}

export function KisskhControlsTest() {
  // Sample episode from the provider's documentation, not a TMDB episode ID.
  const [input, setInput] = React.useState('129692');
  const [episodeId, setEpisodeId] = React.useState('129692');
  const [attempt, setAttempt] = React.useState(0);
  const [probe, setProbe] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [commands, setCommands] = React.useState<string[]>([]);
  const [logs, setLogs] = React.useState<string[]>([]);
  const frame = React.useRef<HTMLIFrameElement>(null);
  const log = (text: string) =>
    setLogs((items) => [`${new Date().toISOString()} ${text}`, ...items].slice(0, 40));
  React.useEffect(() => {
    const started = Date.now();
    const receive = (event: MessageEvent) => {
      const summary = kisskhEventSummary(event, frame.current?.contentWindow ?? null);
      if (summary) log(`provider event: ${summary}`);
    };
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    window.addEventListener('message', receive);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', receive);
    };
  }, [episodeId, attempt]);
  const command = (action: 'play' | 'pause' | 'seek60') => {
    if (!probe) return;
    // This is the VidSrc envelope, deliberately a probe: KissKH does not document it.
    frame.current?.contentWindow?.postMessage({ player: true, action }, KISSKH_ORIGIN);
    setCommands((items) =>
      [
        `${new Date().toISOString()} UNVERIFIED protocol probe sent: ${action}; no control acknowledgement or synchronization is inferred.`,
        ...items,
      ].slice(0, 20),
    );
  };
  return (
    <main className="mx-auto grid max-w-4xl gap-4 p-4">
      <h1>KissKH · Experimental control test</h1>
      <p>
        KissKH documents outgoing events only. The buttons below probe the VidSrc command format
        against KissKH; support is unknown. This does not enable synchronized rooms.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^[1-9]\d{0,9}$/.test(input) || Number(input) > 2147483647) return;
          setEpisodeId(input);
          setAttempt((value) => value + 1);
          setProbe(false);
          setElapsed(0);
          setLogs([]);
          setCommands([]);
        }}
      >
        <label>
          KissKH episode ID{' '}
          <input
            required
            aria-label="KissKH episode ID"
            type="number"
            min="1"
            max="2147483647"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <Button type="submit">Load</Button>
      </form>
      <p>
        The default is a sample episode from the provider docs. For Money Heist, use the numeric
        KissKH episode ID from the provider episode page’s <code>ep=</code> parameter. TMDB
        season/episode numbers are not KissKH IDs.
      </p>
      <div className="relative aspect-video bg-black">
        <iframe
          key={`${episodeId}-${attempt}`}
          ref={frame}
          src={`${KISSKH_ORIGIN}/kisskh/${episodeId}`}
          title="KissKH validation player"
          className="absolute inset-0 size-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => log('Iframe load event; playback and controls are unconfirmed.')}
          onError={() => log('Iframe could not load.')}
        />
      </div>
      <p role="status">Control support: unverified · Test page active for {elapsed}s</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={probe} onChange={(e) => setProbe(e.target.checked)} />
        Video is visibly playing — enable experimental KissKH commands
      </label>
      <div className="flex flex-wrap gap-3">
        <Button disabled={!probe} onClick={() => command('play')}>
          Play probe
        </Button>
        <Button disabled={!probe} onClick={() => command('pause')}>
          Pause probe
        </Button>
        <Button disabled={!probe} onClick={() => command('seek60')}>
          Seek to 60 seconds probe
        </Button>
      </div>
      <p>
        First test pause, then resume, then seek. Record whether the actual video changes and
        whether progress events follow. If nothing happens, this command format is unsupported for
        this player.
      </p>
      <label className="grid gap-2">
        KissKH diagnostics — select and copy this text
        <textarea
          readOnly
          aria-label="KissKH diagnostics"
          className="h-48 w-full rounded border border-border-strong bg-secondary p-3 font-mono text-xs"
          value={`COMMAND PROBES:\n${commands.join('\n') || 'No commands sent yet.'}\n\nPROVIDER EVENTS:\n${logs.join('\n') || 'No player messages received yet.'}`}
        />
      </label>
    </main>
  );
}
