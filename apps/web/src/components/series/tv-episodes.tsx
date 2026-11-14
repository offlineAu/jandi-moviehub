'use client';

import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import * as React from 'react';
import { EASE_EXPO } from '@/components/motion/reveal';
import { Artwork } from '@/components/movies/artwork';
import { apiFetch } from '@/lib/api';
import { cn, formatDate, formatRuntime } from '@/lib/utils';

export type TvSeason = { season_number: number; name: string; episode_count: number };
export type TvEpisode = {
  id: number;
  number: number;
  title: string;
  overview: string;
  airDate: string | null;
  runtimeMin: number | null;
  stillUrl?: string | null;
};
export type TvSeriesData = {
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  firstAirDate: string | null;
  seasons: TvSeason[];
  cast: { name: string; character?: string }[];
  genres?: string[];
  rating?: number | null;
  voteCount?: number | null;
  originalLanguage?: string | null;
};

export function useTvSeries(id: string) {
  return useQuery({
    queryKey: ['tv', id],
    queryFn: () => apiFetch<{ series: TvSeriesData }>(`/tv/${encodeURIComponent(id)}`),
  });
}

export function useTvSeason(id: string, season: number | null) {
  return useQuery({
    queryKey: ['tv-season', id, season],
    queryFn: () =>
      apiFetch<{ season: { name: string; overview: string; episodes: TvEpisode[] } }>(
        `/tv/${encodeURIComponent(id)}/seasons/${season}`,
      ),
    enabled: season !== null,
    staleTime: 5 * 60_000,
  });
}

/** Real seasons only (TMDB lists "Specials" as season 0), in order. */
export function playableSeasons(seasons: TvSeason[]) {
  return seasons
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);
}

export const episodeHref = (seriesId: string | number, season: number, episode: number) =>
  `/watch/tv/${seriesId}/season/${season}/episode/${episode}`;

/** Horizontal season switcher; the active pill glides between seasons. */
export function SeasonTabs({
  seasons,
  value,
  onChange,
  size = 'md',
  label = 'Seasons',
}: {
  seasons: TvSeason[];
  value: number | null;
  onChange: (season: number) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const id = React.useId();
  return (
    <div
      role="tablist"
      tabIndex={-1}
      aria-label={label}
      className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const i = seasons.findIndex((s) => s.season_number === value);
        const next =
          seasons[(i + (e.key === 'ArrowRight' ? 1 : -1) + seasons.length) % seasons.length];
        if (next) {
          e.preventDefault();
          onChange(next.season_number);
          document.getElementById(`${id}-s${next.season_number}`)?.focus();
        }
      }}
    >
      {seasons.map((s) => {
        const active = s.season_number === value;
        return (
          <button
            key={s.season_number}
            id={`${id}-s${s.season_number}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(s.season_number)}
            className={cn(
              'relative isolate shrink-0 rounded-full font-medium transition-colors duration-300 focus-ring',
              size === 'sm' ? 'h-8 px-3.5 text-[13px]' : 'h-10 px-5 text-sm',
              active
                ? 'text-white'
                : 'bg-glass-2 text-foreground/70 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] hover:bg-glass-3 hover:text-foreground',
            )}
          >
            {active ? (
              <motion.span
                layoutId={`${id}-pill`}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-[linear-gradient(110deg,#7c3aed,#c026d3_55%,#db2777)] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_8px_24px_-10px_rgb(219_39_119/0.7)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            ) : null}
            Season {s.season_number}
            <span className={cn('ml-1.5 text-xs', active ? 'text-white/75' : 'text-muted')}>
              {s.episode_count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Three bars bouncing: marks the episode on screen now. */
function NowPlaying() {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 0.2, 0.4].map((d) => (
        <span
          key={d}
          className="w-[3px] origin-bottom animate-[eq_0.9s_ease-in-out_infinite] rounded-full bg-white"
          style={{ animationDelay: `${d}s`, height: '100%' }}
        />
      ))}
    </span>
  );
}

export function EpisodeRow({
  seriesId,
  season,
  episode,
  current = false,
  compact = false,
  index = 0,
}: {
  seriesId: string | number;
  season: number;
  episode: TvEpisode;
  current?: boolean;
  compact?: boolean;
  index?: number;
}) {
  const date = formatDate(episode.airDate);
  const runtime = formatRuntime(episode.runtimeMin);
  const genericTitle = /^episode\s+\d+$/i.test(episode.title.trim());
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_EXPO, delay: Math.min(index, 10) * 0.035 }}
      data-current={current || undefined}
    >
      <Link
        href={episodeHref(seriesId, season, episode.number)}
        aria-current={current ? 'true' : undefined}
        className={cn(
          'group/ep relative flex items-start rounded-2xl transition-[background-color,box-shadow] duration-300 ease-[var(--ease-expo)] focus-ring',
          compact ? 'gap-3 p-2' : 'gap-4 p-2.5 sm:gap-5 sm:p-3',
          current
            ? 'bg-glass-3 shadow-[inset_0_0_0_1px_rgb(168_85_247/0.45)]'
            : 'hover:bg-glass-2',
        )}
      >
        <span
          className={cn(
            'relative aspect-video shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-white/10',
            compact ? 'w-28' : 'w-36 sm:w-56 lg:w-64',
          )}
        >
          <span className="absolute inset-0 transition-transform duration-700 ease-[var(--ease-expo)] group-hover/ep:scale-[1.06]">
            <Artwork
              src={episode.stillUrl}
              alt=""
              sizes={compact ? '112px' : '(min-width: 1024px) 256px, 224px'}
              kind="backdrop"
              fallbackTitle={compact ? '' : `E${episode.number}`}
            />
          </span>
          <span className="absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.65),transparent_55%)]" />
          {/* Play affordance: grows in on hover; always shown for the current episode. */}
          <span
            className={cn(
              'absolute inset-0 grid place-items-center transition-opacity duration-300',
              current
                ? 'opacity-100'
                : 'opacity-0 group-hover/ep:opacity-100 pointer-coarse:opacity-100',
            )}
          >
            <span
              className={cn(
                'grid place-items-center rounded-full bg-white/15 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_8px_24px_-6px_rgb(0_0_0/0.6)] ring-1 ring-white/30 backdrop-blur-md transition-transform duration-500 ease-[var(--ease-expo)]',
                compact ? 'size-8' : 'size-11',
                current ? 'scale-100' : 'scale-75 group-hover/ep:scale-100',
              )}
            >
              {current ? (
                <NowPlaying />
              ) : (
                <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
              )}
            </span>
          </span>
          {runtime && !compact ? (
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              {runtime}
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                current ? 'bg-primary/30 text-white' : 'bg-glass-3 text-foreground/75',
              )}
            >
              E{episode.number}
            </span>
            {current ? (
              <span className="text-[11px] font-medium text-[#f0abfc]">Now playing</span>
            ) : null}
          </span>
          <span
            className={cn(
              'mt-1.5 block font-semibold leading-snug text-foreground transition-colors group-hover/ep:text-white',
              compact ? 'line-clamp-2 text-sm' : 'line-clamp-1 text-base sm:text-lg',
            )}
          >
            {genericTitle ? `Episode ${episode.number}` : episode.title}
          </span>
          {(date || (runtime && compact)) && (
            <span className="mt-1 block text-xs text-muted">
              {[date, compact ? runtime : null].filter(Boolean).join(' · ')}
            </span>
          )}
          {!compact && episode.overview ? (
            <span className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/70 sm:line-clamp-3">
              {episode.overview}
            </span>
          ) : null}
        </span>

        {!compact ? (
          <span
            aria-hidden="true"
            className="mt-1 hidden size-10 shrink-0 place-items-center self-center rounded-full text-foreground/60 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] transition-[background,color,box-shadow,transform] duration-300 ease-[var(--ease-expo)] group-hover/ep:scale-105 group-hover/ep:bg-[linear-gradient(135deg,var(--primary),var(--accent))] group-hover/ep:text-white group-hover/ep:shadow-[0_10px_24px_-8px_rgb(219_39_119/0.7)] md:grid"
          >
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        ) : null}
      </Link>
    </motion.li>
  );
}

export function EpisodeListSkeleton({
  compact = false,
  count = 4,
}: {
  compact?: boolean;
  count?: number;
}) {
  return (
    <ul className="grid gap-1" aria-busy="true" aria-label="Loading episodes">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={cn('flex gap-4', compact ? 'p-2' : 'p-3')}>
          <span
            className={cn(
              'shimmer aspect-video shrink-0 rounded-xl',
              compact ? 'w-28' : 'w-36 sm:w-56 lg:w-64',
            )}
          />
          <span className="grid flex-1 content-start gap-2 pt-1">
            <span className="shimmer h-4 w-10 rounded" />
            <span className="shimmer h-4 w-2/3 rounded" />
            {!compact ? <span className="shimmer h-10 w-full rounded" /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
