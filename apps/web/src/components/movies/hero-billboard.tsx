'use client';

import { Info, Play, Star, Users } from 'lucide-react';
import { AnimatePresence, motion, useSpring } from 'motion/react';
import Link from 'next/link';
import * as React from 'react';
import {
  EASE_EXPO,
  Magnetic,
  ParallaxBackdrop,
  ScrollFade,
  SplitWords,
  Stagger,
  StaggerItem,
  useMotionOff,
} from '@/components/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MovieSummary } from '@/lib/types';
import { formatRating, formatRuntime } from '@/lib/utils';
import { Artwork } from './artwork';

const SLIDE_MS = 8000;

/**
 * The home billboard: up to five featured titles on a slow rotation. Each change is a cut through
 * a soft blur; the backdrop drifts (Ken Burns) and sinks with the scroll while the copy lifts away.
 * Rotation pauses on hover/focus, with the pause button, and never runs with reduced motion.
 */
export function HeroBillboard({ movies, eyebrow }: { movies: MovieSummary[]; eyebrow?: string }) {
  const off = useMotionOff();
  const [index, setIndex] = React.useState(0);
  const [hovering, setHovering] = React.useState(false);
  const count = movies.length;
  const movie = movies[Math.min(index, count - 1)];
  const rotating = count > 1 && !off && !hovering;

  React.useEffect(() => {
    if (!rotating) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [rotating, index, count]);

  // The backdrop leans away from the pointer for a little depth (fine pointers only).
  const px = useSpring(0, { stiffness: 60, damping: 20 });
  const py = useSpring(0, { stiffness: 60, damping: 20 });
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (off || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * -24);
    py.set(((e.clientY - r.top) / r.height - 0.5) * -14);
  };

  if (!movie) return null;
  const rating = formatRating(movie.voteAverage);
  const runtime = formatRuntime(movie.runtimeMin);

  return (
    <section
      aria-labelledby="hero-title"
      onPointerEnter={() => setHovering(true)}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        setHovering(false);
        px.set(0);
        py.set(0);
      }}
      onFocus={() => setHovering(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHovering(false);
      }}
      className="film-grain relative isolate flex min-h-[min(88svh,820px)] items-end overflow-hidden sm:min-h-[min(84svh,780px)]"
    >
      <ParallaxBackdrop className="-z-10 [mask-image:linear-gradient(to_bottom,#000_62%,transparent_100%)]">
        <motion.div className="absolute -inset-6" style={{ x: px, y: py }}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={movie.id}
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 1.08, filter: 'blur(12px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 1.4, ease: EASE_EXPO }}
            >
              <div className="absolute inset-0 animate-ken-burns">
                <Artwork
                  src={movie.backdropUrl ?? movie.posterUrl}
                  alt=""
                  sizes="100vw"
                  priority={index === 0}
                  kind="backdrop"
                  className="object-[center_20%]"
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </ParallaxBackdrop>

      {/* Light leak + vignette: projector warmth from the top right, page ground at the foot. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-[5] [mask-image:linear-gradient(to_bottom,#000_62%,transparent_100%)]"
      >
        <div className="absolute -right-1/4 -top-1/3 size-[80vmax] animate-[ken-burns_18s_ease-in-out_infinite_alternate] rounded-full bg-[radial-gradient(closest-side,rgb(236_72_153/0.22),rgb(147_51_234/0.12)_45%,transparent_70%)] mix-blend-screen" />
        <div className="absolute inset-y-0 left-0 w-1/3 animate-[beam_9s_var(--ease-in-out-cinema)_infinite] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.07),rgb(236_72_153/0.06),transparent)] mix-blend-screen" />
        <div className="absolute inset-0 shadow-[inset_0_0_180px_40px_rgb(0_0_0/0.65)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_8_16/0.94)_0%,rgb(8_8_16/0.6)_38%,transparent_72%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_2%,rgb(8_8_16/0.85)_26%,rgb(8_8_16/0.15)_60%,rgb(8_8_16/0.5)_100%)]" />
      </div>

      <ScrollFade className="relative z-[2] w-full px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:px-10 lg:pb-24">
        <div className="max-w-2xl" aria-live={rotating ? 'off' : 'polite'}>
          <Stagger key={movie.id} immediate stagger={0.08} delay={0.1}>
            {eyebrow ? (
              <StaggerItem
                as="p"
                className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground/85"
              >
                <span className="relative inline-flex size-2" aria-hidden="true">
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent/70" />
                  <span className="relative size-2 rounded-full bg-accent" />
                </span>
                {eyebrow}
              </StaggerItem>
            ) : null}
            <h1
              id="hero-title"
              className="font-display text-[clamp(2.5rem,7.6vw,5.75rem)] font-bold leading-[0.92] tracking-[-0.04em] text-white [text-shadow:0_2px_40px_rgb(0_0_0/0.45)]"
            >
              <SplitWords text={movie.title} delay={0.15} />
            </h1>
            <StaggerItem className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/85">
              {movie.year ? <span>{movie.year}</span> : null}
              {runtime ? <span>{runtime}</span> : null}
              {rating ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                  <span className="sr-only">Rated</span>
                  {rating}
                </span>
              ) : null}
              {movie.genres.slice(0, 3).map((g) => (
                <span key={g} className="text-white/70">
                  {g}
                </span>
              ))}
              {movie.playable ? <Badge variant="playable">Playable</Badge> : null}
              {movie.isDemo ? <Badge variant="demo">Demo</Badge> : null}
            </StaggerItem>
            {movie.overview ? (
              <StaggerItem
                as="p"
                className="mt-4 line-clamp-3 max-w-xl text-base leading-relaxed text-white/85 sm:text-[17px]"
              >
                {movie.overview}
              </StaggerItem>
            ) : null}
            <StaggerItem className="mt-8 flex flex-wrap items-center gap-3">
              {movie.playable ? (
                <Magnetic>
                  <Button asChild size="lg">
                    <Link href={`/watch/${movie.id}`}>
                      <Play className="fill-current" aria-hidden="true" />
                      Watch now
                    </Link>
                  </Button>
                </Magnetic>
              ) : null}
              <Magnetic>
                <Button asChild size="lg" variant={movie.playable ? 'overlay' : 'primary'}>
                  <Link href={`/movies/${movie.id}`}>
                    <Info aria-hidden="true" />
                    More info
                  </Link>
                </Button>
              </Magnetic>
              {movie.playable ? (
                <Button asChild size="lg" variant="overlay" className="max-[420px]:w-full">
                  <Link href={`/rooms/new?movieId=${movie.id}`}>
                    <Users aria-hidden="true" />
                    Start a watch party
                  </Link>
                </Button>
              ) : null}
            </StaggerItem>
          </Stagger>
        </div>
      </ScrollFade>
    </section>
  );
}

export function HeroBillboardSkeleton() {
  return (
    <div
      className="relative flex min-h-[min(88svh,820px)] items-end overflow-hidden bg-[radial-gradient(80%_60%_at_70%_20%,#1b1430,transparent)] sm:min-h-[min(84svh,780px)]"
      aria-busy="true"
      aria-label="Loading featured title"
    >
      <div className="w-full px-4 pb-24 sm:px-6 lg:px-10">
        <div className="shimmer h-4 w-32 rounded" />
        <div className="shimmer mt-4 h-16 w-[70%] max-w-xl rounded-lg" />
        <div className="shimmer mt-4 h-4 w-60 rounded" />
        <div className="shimmer mt-5 h-16 w-full max-w-lg rounded-lg" />
        <div className="mt-8 flex gap-3">
          <div className="shimmer h-12 w-36 rounded-xl" />
          <div className="shimmer h-12 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
