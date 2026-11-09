'use client';

import type Hls from 'hls.js';
import {
  Captions,
  CaptionsOff,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { PortalContainerContext, Tooltip } from '@/components/ui/tooltip';
import { resolvePreferences, useMe } from '@/lib/queries/auth';
import type { PlaybackSource } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MediaSlider } from './media-slider';
import {
  PLAYBACK_RATES,
  clamp,
  formatTime,
  formatTimeVerbose,
  nominalRate,
  readStoredVolume,
  selectSource,
  shortcutFor,
  storeVolume,
  timeRangesToArray,
  type Range,
  type SelectedSource,
  type ShortcutAction,
} from './utils';

export type PlayerIntent =
  | { type: 'play' | 'pause' }
  | { type: 'seek'; positionSec: number }
  | { type: 'rate'; rate: number };

export interface VideoPlayerProps {
  sources: PlaybackSource[];
  title: string;
  mode: 'solo' | 'synced';
  canControl?: boolean;
  onIntent?: (intent: PlayerIntent) => void;
  startAtSec?: number;
  autoPlay?: boolean;
  onTimeUpdate?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
  onBufferingChange?: (buffering: boolean) => void;
  onPlaybackErrorChange?: (failed: boolean) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  nextLabel?: string;
  theater?: boolean;
  onTheaterChange?: (v: boolean) => void;
  overlay?: React.ReactNode;
  className?: string;
}

export interface VideoPlayerHandle {
  video: HTMLVideoElement | null;
}

const HOST_ONLY = 'Only hosts can control playback';
const HIDE_DELAY_MS = 2600;

interface QualityLevel {
  index: number;
  label: string;
}

type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

function ControlButton({
  label,
  onClick,
  children,
  disabledReason,
  className,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  /** When set, the control is unavailable; the reason is shown as its tooltip. */
  disabledReason?: string;
  className?: string;
  pressed?: boolean;
}) {
  const disabled = !!disabledReason;
  return (
    <Tooltip label={disabledReason ?? label}>
      <button
        type="button"
        aria-label={label}
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        onClick={() => {
          if (!disabled) onClick();
        }}
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary sm:size-9 [&_svg]:size-5',
          disabled && 'cursor-not-allowed text-white/40 hover:bg-transparent',
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export const VideoPlayer = React.forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      sources,
      title,
      mode,
      canControl = true,
      onIntent,
      startAtSec,
      autoPlay = false,
      onTimeUpdate,
      onEnded,
      onBufferingChange,
      onPlaybackErrorChange,
      onNext,
      onPrevious,
      nextLabel,
      theater,
      onTheaterChange,
      overlay,
      className,
    },
    ref,
  ) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const hlsRef = React.useRef<Hls | null>(null);
    const [container, setContainer] = React.useState<HTMLDivElement | null>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        get video() {
          return videoRef.current;
        },
      }),
      [],
    );

    const me = useMe();
    const prefs = resolvePreferences(me.data);

    // ---------- source selection ----------
    const [selected, setSelected] = React.useState<SelectedSource | null | undefined>(undefined);
    const sourceKey = sources.map((s) => s.url).join('|');
    React.useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      let cancelled = false;
      void (async () => {
        const { default: HlsCtor } = await import('hls.js');
        if (cancelled) return;
        setSelected(
          selectSource(sources, {
            canPlayType: (mime) => video.canPlayType(mime),
            hlsJsSupported: HlsCtor.isSupported(),
            preferNativeHls:
              !sources.some((source) => source.assetId.startsWith('kisskh-direct:')) ||
              /iPhone|iPad|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
          }),
        );
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceKey]);

    // ---------- media state ----------
    const [paused, setPaused] = React.useState(true);
    const [started, setStarted] = React.useState(false);
    const [current, setCurrent] = React.useState(0);
    const [duration, setDuration] = React.useState(0);
    const [buffered, setBuffered] = React.useState<Range[]>([]);
    const [buffering, setBuffering] = React.useState(false);
    const [rate, setRate] = React.useState(1);
    const [volume, setVolume] = React.useState(0.8);
    const [muted, setMuted] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fullscreen, setFullscreen] = React.useState(false);
    const [pip, setPip] = React.useState(false);
    const [pipSupported, setPipSupported] = React.useState(false);
    const [captionIndex, setCaptionIndex] = React.useState(-1);
    const [levels, setLevels] = React.useState<QualityLevel[]>([]);
    const [level, setLevel] = React.useState(-1);
    const [scrub, setScrub] = React.useState<number | null>(null);
    const [flash, setFlash] = React.useState<{
      id: number;
      text: string;
      side?: 'left' | 'right';
    } | null>(null);
    const [announcement, setAnnouncement] = React.useState('');
    const startApplied = React.useRef(false);
    const lastCaption = React.useRef(0);
    const mediaRecoveries = React.useRef(0);

    React.useEffect(() => {
      onPlaybackErrorChange?.(!!error || selected === null);
    }, [error, selected, onPlaybackErrorChange]);
    const selectedSource = selected?.source ?? null;
    const captions = React.useMemo(() => selectedSource?.captions ?? [], [selectedSource]);

    const showFlash = React.useCallback((text: string, side?: 'left' | 'right') => {
      setFlash({ id: Date.now(), text, side });
      setAnnouncement(text);
    }, []);
    React.useEffect(() => {
      if (!flash) return;
      const t = window.setTimeout(() => setFlash(null), 700);
      return () => window.clearTimeout(t);
    }, [flash]);

    // Volume: remembered in localStorage, default from the user's preferences.
    React.useEffect(() => {
      const stored = readStoredVolume(prefs.defaultVolume);
      setVolume(stored.volume);
      setMuted(stored.muted);
      const video = videoRef.current;
      if (video) {
        video.volume = stored.volume;
        video.muted = stored.muted;
      }
    }, [prefs.defaultVolume]);

    React.useEffect(() => {
      setPipSupported(
        typeof document !== 'undefined' &&
          'pictureInPictureEnabled' in document &&
          document.pictureInPictureEnabled &&
          !videoRef.current?.disablePictureInPicture,
      );
    }, []);

    // Attach the selected source.
    const attach = React.useCallback(async () => {
      const video = videoRef.current;
      if (!video || !selected) return;
      setError(null);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setLevels([]);
      setLevel(-1);
      if (selected.engine === 'hls.js') {
        const { default: HlsCtor } = await import('hls.js');
        const hls = new HlsCtor({ enableWorker: true, capLevelToPlayerSize: true });
        hlsRef.current = hls;
        hls.on(HlsCtor.Events.MANIFEST_PARSED, (_e, data) => {
          const list = data.levels
            .map((l, index) => ({
              index,
              label: l.height ? `${l.height}p` : `${Math.round((l.bitrate || 0) / 1000)} kbps`,
            }))
            .sort(
              (a, b) => (data.levels[b.index]?.height ?? 0) - (data.levels[a.index]?.height ?? 0),
            );
          setLevels(list.length > 1 ? list : []);
        });
        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries.current < 2) {
            mediaRecoveries.current += 1;
            hls.recoverMediaError();
            return;
          }
          setBuffering(false);
          setError(
            data.type === HlsCtor.ErrorTypes.NETWORK_ERROR
              ? 'The stream stopped loading. Check your connection and try again.'
              : 'This video couldn’t be decoded. Try again.',
          );
        });
        hls.loadSource(selected.source.url);
        hls.attachMedia(video);
      } else {
        video.src = selected.source.url;
        video.load();
      }
    }, [selected]);

    React.useEffect(() => {
      startApplied.current = false;
      mediaRecoveries.current = 0;
      void attach();
      return () => {
        hlsRef.current?.destroy();
        hlsRef.current = null;
      };
    }, [attach]);

    const retry = () => {
      const video = videoRef.current;
      const at = video?.currentTime ?? 0;
      setError(null);
      const hls = hlsRef.current;
      if (hls) {
        mediaRecoveries.current = 0;
        hls.startLoad(at);
        hls.recoverMediaError();
        return;
      }
      if (video && selected) {
        startApplied.current = true;
        video.src = selected.source.url;
        video.load();
        video.currentTime = at;
      }
    };

    // Keep latest callbacks in refs so event listeners don't need re-binding.
    const onTimeUpdateRef = React.useRef(onTimeUpdate);
    const onEndedRef = React.useRef(onEnded);
    const onBufferingChangeRef = React.useRef(onBufferingChange);
    React.useEffect(() => {
      onTimeUpdateRef.current = onTimeUpdate;
      onEndedRef.current = onEnded;
      onBufferingChangeRef.current = onBufferingChange;
    });

    // Media element events → UI state.
    React.useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      let waitingAt: number | null = null;
      const setBuf = (v: boolean) => {
        waitingAt = v ? video.currentTime : null;
        setBuffering((prev) => {
          if (prev !== v) onBufferingChangeRef.current?.(v);
          return v;
        });
      };
      const handlers: Record<string, () => void> = {
        play: () => {
          setPaused(false);
          setStarted(true);
        },
        playing: () => {
          setPaused(false);
          setBuf(false);
        },
        pause: () => {
          setPaused(true);
          setBuf(false);
        },
        waiting: () => setBuf(true),
        canplay: () => setBuf(false),
        seeked: () => setBuf(false),
        timeupdate: () => {
          if (waitingAt !== null && !video.paused && video.currentTime > waitingAt) setBuf(false);
          setCurrent(video.currentTime);
          onTimeUpdateRef.current?.(
            video.currentTime,
            Number.isFinite(video.duration) ? video.duration : 0,
          );
        },
        durationchange: () => setDuration(Number.isFinite(video.duration) ? video.duration : 0),
        loadedmetadata: () => {
          setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          if (!startApplied.current) {
            startApplied.current = true;
            if (startAtSec && startAtSec > 0 && startAtSec < (video.duration || Infinity) - 1) {
              video.currentTime = startAtSec;
              setCurrent(startAtSec);
            }
            if (autoPlay && mode === 'solo') {
              video.play().catch(() => {
                /* Autoplay blocked: the big play button stays visible. */
              });
            }
          }
        },
        progress: () => setBuffered(timeRangesToArray(video.buffered)),
        ratechange: () => setRate(video.playbackRate),
        volumechange: () => {
          setVolume(video.volume);
          setMuted(video.muted);
        },
        ended: () => {
          setPaused(true);
          setBuf(false);
          onEndedRef.current?.();
        },
        error: () => {
          if (hlsRef.current) return; // hls.js reports its own errors
          setBuf(false);
          setError('This video couldn’t be played. Try again.');
        },
        enterpictureinpicture: () => setPip(true),
        leavepictureinpicture: () => setPip(false),
      };
      for (const [event, fn] of Object.entries(handlers)) video.addEventListener(event, fn);
      return () => {
        for (const [event, fn] of Object.entries(handlers)) video.removeEventListener(event, fn);
      };
    }, [autoPlay, mode, startAtSec]);

    // Fullscreen tracking.
    React.useEffect(() => {
      const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
      document.addEventListener('fullscreenchange', onChange);
      return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    // Captions: apply mode to text tracks.
    React.useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i += 1) {
        const track = tracks[i];
        if (track) track.mode = i === captionIndex ? 'showing' : 'hidden';
      }
    }, [captionIndex, captions]);

    // Default captions from preferences once tracks are known.
    React.useEffect(() => {
      if (!captions.length) {
        setCaptionIndex(-1);
        return;
      }
      const lang = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
      const preferred = Math.max(
        0,
        captions.findIndex((c) => c.lang.slice(0, 2) === lang),
      );
      lastCaption.current = preferred;
      setCaptionIndex(prefs.captionsByDefault ? preferred : -1);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [captions]);

    // ---------- controls visibility ----------
    const [controlsVisible, setControlsVisible] = React.useState(true);
    const [menuOpen, setMenuOpen] = React.useState(0);
    const hideTimer = React.useRef<number | undefined>(undefined);
    const pokeControls = React.useCallback(() => {
      setControlsVisible(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), HIDE_DELAY_MS);
    }, []);
    React.useEffect(() => () => window.clearTimeout(hideTimer.current), []);
    const showControls =
      paused || !started || controlsVisible || menuOpen > 0 || !!error || scrub !== null;
    const onMenuOpenChange = (open: boolean) =>
      setMenuOpen((n) => Math.max(0, n + (open ? 1 : -1)));

    // ---------- actions ----------
    const synced = mode === 'synced';
    const transportLocked = synced && !canControl;

    const doPlayPause = React.useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      if (transportLocked) {
        showFlash(HOST_ONLY);
        return;
      }
      const wantPlay = video.paused || video.ended;
      if (synced) {
        onIntent?.({ type: wantPlay ? 'play' : 'pause' });
        return;
      }
      if (wantPlay) {
        video.play().catch(() => setError('Playback couldn’t start. Try again.'));
      } else {
        video.pause();
      }
    }, [onIntent, showFlash, synced, transportLocked]);

    const doSeekTo = React.useCallback(
      (positionSec: number) => {
        const video = videoRef.current;
        if (!video) return;
        if (transportLocked) {
          showFlash(HOST_ONLY);
          return;
        }
        const max = Number.isFinite(video.duration) ? video.duration : positionSec;
        const target = clamp(positionSec, 0, max);
        if (synced) onIntent?.({ type: 'seek', positionSec: target });
        else {
          video.currentTime = target;
          setCurrent(target);
        }
      },
      [onIntent, showFlash, synced, transportLocked],
    );

    const doSeekBy = React.useCallback(
      (seconds: number, side?: 'left' | 'right') => {
        const video = videoRef.current;
        if (!video) return;
        if (transportLocked) {
          showFlash(HOST_ONLY);
          return;
        }
        doSeekTo(video.currentTime + seconds);
        showFlash(`${seconds > 0 ? '+' : '−'}${Math.abs(seconds)}s`, side);
      },
      [doSeekTo, showFlash, transportLocked],
    );

    const doRate = (value: number) => {
      const video = videoRef.current;
      if (!video) return;
      if (transportLocked) {
        showFlash(HOST_ONLY);
        return;
      }
      if (synced) onIntent?.({ type: 'rate', rate: value });
      else video.playbackRate = value;
    };

    const doVolume = React.useCallback((value: number, opts: { announce?: boolean } = {}) => {
      const video = videoRef.current;
      if (!video) return;
      const v = clamp(value, 0, 1);
      video.volume = v;
      video.muted = v === 0;
      storeVolume(v, v === 0);
      if (opts.announce) setAnnouncement(`Volume ${Math.round(v * 100)}%`);
    }, []);

    const doToggleMute = React.useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      const nextMuted = !video.muted;
      video.muted = nextMuted;
      if (!nextMuted && video.volume === 0) video.volume = 0.5;
      storeVolume(video.volume, nextMuted);
      showFlash(nextMuted ? 'Muted' : 'Unmuted');
    }, [showFlash]);

    const doToggleFullscreen = React.useCallback(async () => {
      const el = containerRef.current;
      const video = videoRef.current as WebkitVideo | null;
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (el?.requestFullscreen) await el.requestFullscreen();
        else video?.webkitEnterFullscreen?.();
      } catch {
        /* fullscreen rejected (e.g. not user-initiated) */
      }
    }, []);

    const doTogglePip = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch {
        showFlash('Picture-in-picture isn’t available');
      }
    };

    const doToggleCaptions = React.useCallback(() => {
      if (!captions.length) return;
      setCaptionIndex((index) => {
        if (index >= 0) {
          lastCaption.current = index;
          showFlash('Captions off');
          return -1;
        }
        showFlash('Captions on');
        return lastCaption.current;
      });
    }, [captions.length, showFlash]);

    const doQuality = (index: number) => {
      const hls = hlsRef.current;
      if (!hls) return;
      hls.currentLevel = index;
      setLevel(index);
    };

    const runShortcut = (action: ShortcutAction) => {
      switch (action.kind) {
        case 'toggle-play':
          doPlayPause();
          break;
        case 'seek-by':
          doSeekBy(action.seconds);
          break;
        case 'volume-by': {
          const video = videoRef.current;
          if (!video) break;
          const base = video.muted ? 0 : video.volume;
          const next = clamp(base + action.delta, 0, 1);
          doVolume(next);
          showFlash(`Volume ${Math.round(next * 100)}%`);
          break;
        }
        case 'toggle-mute':
          doToggleMute();
          break;
        case 'toggle-fullscreen':
          void doToggleFullscreen();
          break;
        case 'toggle-captions':
          doToggleCaptions();
          break;
        case 'toggle-theater':
          if (onTheaterChange) onTheaterChange(!theater);
          break;
        case 'next':
          if (onNext) {
            if (transportLocked) showFlash(HOST_ONLY);
            else onNext();
          }
          break;
        case 'previous':
          if (onPrevious) {
            if (transportLocked) showFlash(HOST_ONLY);
            else onPrevious();
          }
          break;
      }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="menu"], [role="menuitem"]',
        )
      )
        return;
      const action = shortcutFor(e);
      if (!action) return;
      // Space/Enter on a focused button should activate that button, not the shortcut.
      if (e.key === ' ' && target.tagName === 'BUTTON') return;
      e.preventDefault();
      pokeControls();
      runShortcut(action);
    };

    // ---------- surface pointer handling (click / tap / double-tap) ----------
    const tapRef = React.useRef<{ time: number; x: number; timer?: number }>({ time: 0, x: 0 });
    const onSurfacePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (e.pointerType === 'mouse') {
        doPlayPause();
        pokeControls();
        return;
      }
      // Touch: single tap toggles controls; double tap on the sides skips ±10 s.
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const now = Date.now();
      const tap = tapRef.current;
      if (now - tap.time < 300) {
        window.clearTimeout(tap.timer);
        tap.time = 0;
        if (relX < 0.35) doSeekBy(-10, 'left');
        else if (relX > 0.65) doSeekBy(10, 'right');
        else doPlayPause();
        return;
      }
      tap.time = now;
      tap.x = relX;
      tap.timer = window.setTimeout(() => {
        if (showControls && started && !paused) {
          window.clearTimeout(hideTimer.current);
          setControlsVisible(false);
        } else {
          pokeControls();
        }
      }, 300);
    };

    const onDoubleClick = (e: React.MouseEvent) => {
      if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return;
      void doToggleFullscreen();
    };

    // ---------- render ----------
    const effectiveDuration = duration || selectedSource?.durationSec || 0;
    const shownTime = scrub ?? current;
    const displayRate = nominalRate(rate);
    const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
    const lockedReason = transportLocked ? HOST_ONLY : undefined;
    const noSource = selected === null;

    return (
      <PortalContainerContext.Provider value={container}>
        <div
          ref={(node) => {
            containerRef.current = node;
            setContainer(node);
          }}
          role="region"
          aria-label={`Video player: ${title}`}
          data-controls={showControls ? 'shown' : 'hidden'}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') pokeControls();
          }}
          onFocus={pokeControls}
          className={cn(
            'group/player relative isolate aspect-video w-full overflow-hidden bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-primary',
            fullscreen ? 'rounded-none' : 'rounded-xl sm:rounded-2xl',
            !showControls && 'cursor-none',
            className,
          )}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 size-full bg-black object-contain"
            playsInline
            preload="metadata"
            aria-label={title}
          >
            {captions.map((c) => (
              <track key={c.url} kind="subtitles" src={c.url} srcLang={c.lang} label={c.label} />
            ))}
          </video>

          {/* Click / tap surface */}
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[1]"
            onPointerUp={onSurfacePointerUp}
            onDoubleClick={onDoubleClick}
          />

          {overlay ? (
            <div className="pointer-events-none absolute inset-0 z-[2] [&>*]:pointer-events-auto">
              {overlay}
            </div>
          ) : null}

          {/* Buffering */}
          {buffering && !error ? (
            <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center">
              <Spinner className="size-12 text-white drop-shadow-lg" label="Buffering" />
            </div>
          ) : null}

          {/* Transient feedback (seek, volume, host-only) */}
          {flash ? (
            <div
              key={flash.id}
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-1/2 z-[4] -translate-y-1/2 animate-in fade-in-0 zoom-in-95 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold backdrop-blur',
                flash.side === 'left'
                  ? 'left-[12%]'
                  : flash.side === 'right'
                    ? 'right-[12%]'
                    : 'left-1/2 -translate-x-1/2',
              )}
            >
              {flash.text}
            </div>
          ) : null}

          {/* Big play button before start / when paused (solo, or synced with control) */}
          {paused && !buffering && !error && !noSource && (!started || mode === 'solo') ? (
            <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center">
              <button
                type="button"
                onClick={doPlayPause}
                aria-label={started ? 'Play' : `Play ${title}`}
                aria-disabled={transportLocked || undefined}
                className={cn(
                  'pointer-events-auto grid size-16 place-items-center rounded-full bg-brand shadow-[0_10px_40px_-6px_rgb(219_39_119/0.7)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:size-20',
                  transportLocked && 'bg-white/20 shadow-none',
                )}
              >
                <Play
                  className="size-7 translate-x-0.5 fill-current sm:size-8"
                  aria-hidden="true"
                />
              </button>
            </div>
          ) : null}

          {/* Error overlay */}
          {error || noSource ? (
            <div
              role="alert"
              className="absolute inset-0 z-[5] grid place-items-center bg-black/80 p-6 text-center"
            >
              <div className="grid max-w-sm justify-items-center gap-3">
                <TriangleAlert className="size-8 text-danger" aria-hidden="true" />
                <p className="font-display text-lg font-semibold">
                  {noSource ? 'This video format isn’t supported here' : 'Playback stopped'}
                </p>
                <p className="text-sm text-white/75">
                  {noSource
                    ? 'Your browser can’t play any of the available sources. Try a different browser.'
                    : error}
                </p>
                {!noSource ? (
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <RotateCw className="size-4" aria-hidden="true" />
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Controls */}
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 z-[6] bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2 pb-2 pt-16 transition-opacity duration-300 sm:px-4 sm:pb-3',
              showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onFocusCapture={pokeControls}
          >
            <div className="mb-1 flex items-center gap-3 px-1 sm:px-0">
              <MediaSlider
                label="Seek"
                value={shownTime}
                max={effectiveDuration}
                step={5}
                bigStep={Math.max(10, effectiveDuration / 10)}
                valueText={`${formatTimeVerbose(shownTime)} of ${formatTimeVerbose(effectiveDuration)}`}
                buffered={buffered}
                disabled={transportLocked}
                formatPreview={formatTime}
                onScrub={(v) => setScrub(v)}
                onCommit={(v) => {
                  setScrub(null);
                  doSeekTo(v);
                }}
                className="flex-1"
              />
            </div>

            <div className="flex items-center gap-0.5 sm:gap-1">
              {onPrevious ? (
                <ControlButton label="Previous" onClick={onPrevious} disabledReason={lockedReason}>
                  <SkipBack className="fill-current" aria-hidden="true" />
                </ControlButton>
              ) : null}
              <ControlButton
                label={paused ? 'Play' : 'Pause'}
                onClick={doPlayPause}
                disabledReason={lockedReason}
              >
                {paused ? (
                  <Play className="fill-current" aria-hidden="true" />
                ) : (
                  <Pause className="fill-current" aria-hidden="true" />
                )}
              </ControlButton>
              {onNext ? (
                <ControlButton
                  label={nextLabel ? `Next: ${nextLabel}` : 'Next'}
                  onClick={onNext}
                  disabledReason={lockedReason}
                >
                  <SkipForward className="fill-current" aria-hidden="true" />
                </ControlButton>
              ) : null}
              <ControlButton
                label="Back 10 seconds"
                onClick={() => doSeekBy(-10)}
                disabledReason={lockedReason}
                className="hidden min-[480px]:grid"
              >
                <RotateCcw aria-hidden="true" />
              </ControlButton>
              <ControlButton
                label="Forward 10 seconds"
                onClick={() => doSeekBy(10)}
                disabledReason={lockedReason}
                className="hidden min-[480px]:grid"
              >
                <RotateCw aria-hidden="true" />
              </ControlButton>

              <div className="group/volume flex items-center">
                <ControlButton label={muted ? 'Unmute' : 'Mute'} onClick={doToggleMute}>
                  <VolumeIcon aria-hidden="true" />
                </ControlButton>
                <div className="hidden w-0 overflow-hidden transition-[width] duration-200 group-hover/volume:w-24 group-focus-within/volume:w-24 sm:block">
                  <MediaSlider
                    label="Volume"
                    size="volume"
                    value={muted ? 0 : volume}
                    max={1}
                    step={0.05}
                    bigStep={0.2}
                    valueText={muted ? 'Muted' : `${Math.round(volume * 100)}%`}
                    onScrub={(v) => doVolume(v)}
                    onCommit={(v) => doVolume(v, { announce: true })}
                    className="mx-2 w-20"
                  />
                </div>
              </div>

              <p className="ml-1 whitespace-nowrap text-xs font-medium tabular-nums text-white/90 sm:ml-2 sm:text-sm">
                <span className="sr-only">Elapsed </span>
                {formatTime(shownTime)}
                <span className="text-white/50"> / </span>
                <span className="sr-only">Duration </span>
                {formatTime(effectiveDuration)}
              </p>

              <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
                {captions.length ? (
                  <DropdownMenu modal={false} onOpenChange={onMenuOpenChange}>
                    <Tooltip label="Captions">
                      <DropdownMenuTrigger
                        aria-label={captionIndex >= 0 ? 'Captions (on)' : 'Captions (off)'}
                        className="grid size-10 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-primary sm:size-9 [&_svg]:size-5"
                      >
                        {captionIndex >= 0 ? (
                          <Captions aria-hidden="true" />
                        ) : (
                          <CaptionsOff aria-hidden="true" />
                        )}
                      </DropdownMenuTrigger>
                    </Tooltip>
                    <DropdownMenuContent align="end" side="top" className="w-48">
                      <DropdownMenuLabel>Captions</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={String(captionIndex)}
                        onValueChange={(v) => setCaptionIndex(Number(v))}
                      >
                        <DropdownMenuRadioItem value="-1">Off</DropdownMenuRadioItem>
                        {captions.map((c, i) => (
                          <DropdownMenuRadioItem key={c.url} value={String(i)}>
                            {c.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}

                <DropdownMenu modal={false} onOpenChange={onMenuOpenChange}>
                  <Tooltip label="Playback settings">
                    <DropdownMenuTrigger
                      aria-label={`Playback settings (speed ${displayRate}×${levels.length ? `, quality ${level === -1 ? 'auto' : (levels.find((l) => l.index === level)?.label ?? '')}` : ''})`}
                      className="grid size-10 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-primary sm:size-9 [&_svg]:size-5"
                    >
                      {levels.length ? (
                        <Settings2 aria-hidden="true" />
                      ) : (
                        <Gauge aria-hidden="true" />
                      )}
                    </DropdownMenuTrigger>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    side="top"
                    className="max-h-[min(70vh,24rem)] w-52 overflow-y-auto"
                  >
                    <DropdownMenuLabel>
                      Speed
                      {transportLocked ? (
                        <span className="block text-[11px] font-normal">{HOST_ONLY}</span>
                      ) : null}
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={String(displayRate)}
                      onValueChange={(v) => doRate(Number(v))}
                    >
                      {PLAYBACK_RATES.map((r) => (
                        <DropdownMenuRadioItem key={r} value={String(r)} disabled={transportLocked}>
                          {r === 1 ? 'Normal' : `${r}×`}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    {levels.length ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Quality</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={String(level)}
                          onValueChange={(v) => doQuality(Number(v))}
                        >
                          <DropdownMenuRadioItem value="-1">Auto</DropdownMenuRadioItem>
                          {levels.map((l) => (
                            <DropdownMenuRadioItem key={l.index} value={String(l.index)}>
                              {l.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>

                {pipSupported ? (
                  <ControlButton
                    label={pip ? 'Exit picture-in-picture' : 'Picture-in-picture'}
                    onClick={() => void doTogglePip()}
                    className="hidden sm:grid"
                  >
                    <PictureInPicture2 aria-hidden="true" />
                  </ControlButton>
                ) : null}
                {onTheaterChange ? (
                  <ControlButton
                    label={theater ? 'Exit theater mode' : 'Theater mode'}
                    onClick={() => onTheaterChange(!theater)}
                    pressed={!!theater}
                    className="hidden lg:grid"
                  >
                    <RectangleHorizontal aria-hidden="true" />
                  </ControlButton>
                ) : null}
                <ControlButton
                  label={fullscreen ? 'Exit full screen' : 'Full screen'}
                  onClick={() => void doToggleFullscreen()}
                >
                  {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
                </ControlButton>
              </div>
            </div>
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
        </div>
      </PortalContainerContext.Provider>
    );
  },
);
