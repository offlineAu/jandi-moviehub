'use client';

import * as React from 'react';
import Link from 'next/link';
import { expectedPosition, type ExternalMedia } from '@jandi/shared';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import { VidsrcAdapter, type EmbedStatus } from '@/lib/sync/vidsrc-adapter';
import { Button } from '@/components/ui/button';

export function VidsrcRoomPlayer({
  src,
  title,
  media,
  engine,
  canControl = false,
  connected = true,
  episodeHref,
  overlay,
}: {
  src: string;
  title: string;
  media: Exclude<ExternalMedia, { provider: 'anime' }>;
  engine?: RoomSyncEngine | null;
  canControl?: boolean;
  connected?: boolean;
  episodeHref?: string;
  overlay?: React.ReactNode;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const controlRef = React.useRef(canControl);
  controlRef.current = canControl;
  const [attempt, setAttempt] = React.useState(0);
  const [status, setStatus] = React.useState<EmbedStatus>('activation');
  const [seek, setSeek] = React.useState('0');
  const [position, setPosition] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const adapterRef = React.useRef<VidsrcAdapter | null>(null);
  const identity = JSON.stringify(media);
  React.useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    const adapter = new VidsrcAdapter(iframe, JSON.parse(identity) as Exclude<ExternalMedia, { provider: 'anime' }>);
    adapterRef.current = adapter;
    engine?.attachPlayer(adapter);
    const update = () => {
      setStatus(adapter.status);
      setPosition(adapter.currentTime);
      setDuration(adapter.duration);
    };
    let metadataSent = false;
    const message = (event: MessageEvent) => {
      if (!adapter.accept(event)) return;
      update();
      if (
        !metadataSent &&
        controlRef.current &&
        engine?.current?.externalMedia &&
        engine.current.durationSec === null &&
        adapter.duration > 0
      ) {
        metadataSent = true;
        void engine.intent({ type: 'duration', durationSec: adapter.duration }).then((ok) => {
          if (!ok) metadataSent = false;
        });
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible' && engine)
        void engine.join().catch(() => undefined);
    };
    window.addEventListener('message', message);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(update, 1000);
    update();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', message);
      document.removeEventListener('visibilitychange', visible);
      adapter.destroy();
      engine?.attachPlayer(null);
      adapterRef.current = null;
    };
  }, [identity, attempt, engine, src]);
  const enabled = status === 'ready' && connected;
  const catchingUp =
    !!engine?.current &&
    Math.abs(position - expectedPosition(engine.current, engine.serverNow)) > 3;
  return (
    <section aria-label={`VidSrc player: ${title}`}>
      <div className="relative aspect-video bg-black">
        <iframe
          key={`${src}-${attempt}`}
          ref={frame}
          src={src}
          title={`${title} VidSrc player`}
          className="absolute inset-0 size-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => {
            adapterRef.current?.fail();
            setStatus('failed');
          }}
        />
        <div className="pointer-events-none absolute inset-0">{overlay}</div>
      </div>
      <div className="grid gap-3 p-4 text-sm text-muted">
        <p role="status">
          {!connected
            ? 'Connection lost. Reconnecting to the room…'
            : status === 'activation'
              ? 'Tap play inside the player to join playback. Playback has not been confirmed.'
              : status === 'unknown'
                ? 'Playback status unknown. Waiting for the player, or reload to try again.'
                : status === 'failed'
                  ? 'The embedded player could not load. Try reloading or opening the episode separately.'
                  : engine
                    ? catchingUp
                      ? 'Catching up to the room timeline…'
                      : 'Synchronized playback · Video quality and captions are yours.'
                    : 'Playback confirmed · Individual playback'}
        </p>
        {engine && (
          <p>
            {Math.floor(position)} / {Math.floor(duration)} seconds
          </p>
        )}
        {engine && canControl && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!enabled}
              onClick={() => void engine.intent({ type: 'play' })}
            >
              Play for everyone
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!enabled}
              onClick={() => void engine.intent({ type: 'pause' })}
            >
              Pause for everyone
            </Button>
            <label className="flex items-center gap-2">
              Seek to seconds
              <input
                aria-label="Seek to seconds"
                type="number"
                min="0"
                max={duration || 86400}
                value={seek}
                onChange={(e) => setSeek(e.target.value)}
                className="w-24 rounded border border-border-strong bg-secondary p-2"
              />
            </label>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                !enabled ||
                !Number.isFinite(Number(seek)) ||
                Number(seek) < 0 ||
                Number(seek) > (duration || 86400)
              }
              onClick={() => void engine.intent({ type: 'seek', positionSec: Number(seek) })}
            >
              Seek for everyone
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setStatus('activation');
              setAttempt((value) => value + 1);
            }}
          >
            Reload my player
          </Button>
          {episodeHref && (
            <Link
              href={episodeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Player blank? Open this title separately
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
