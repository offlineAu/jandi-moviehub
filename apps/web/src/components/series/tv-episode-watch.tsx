'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { roomTitleSchema } from '@jandi/shared';
import { motion } from 'motion/react';
import Link from 'next/link';
import * as React from 'react';
import { EASE_EXPO } from '@/components/motion/reveal';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { cn, formatDate, formatRuntime } from '@/lib/utils';
import { RecordTvVisit } from './recent-tv';
import {
  EpisodeListSkeleton,
  EpisodeRow,
  SeasonTabs,
  episodeHref,
  playableSeasons,
  useTvSeason,
  useTvSeries,
} from './tv-episodes';
import { ProviderSeriesWatch } from './provider-series-watch';
import { TvPlayback } from './tv-playback';

/**
 * Episode page: player first; under it what's playing and previous/next; beside it (below on
 * phones) the season's episode list so the next pick is always one tap away.
 */
export function TvEpisodeWatch(props: { id: string; season: string; episode: string }) {
  if (props.id === '71446')
    return <ProviderSeriesWatch season={props.season} episode={props.episode} />;
  return <CatalogEpisodeWatch {...props} />;
}

function CatalogEpisodeWatch({
  id,
  season,
  episode,
}: {
  id: string;
  season: string;
  episode: string;
}) {
  const seasonNo = Number(season);
  const episodeNo = Number(episode);
  const series = useTvSeries(id);
  const current = useTvSeason(id, seasonNo);
  const [browseSeason, setBrowseSeason] = React.useState(seasonNo);
  React.useEffect(() => setBrowseSeason(seasonNo), [seasonNo]);
  const browsing = useTvSeason(id, browseSeason);

  // Keep the playing episode in view inside the scrolling list.
  const listRef = React.useRef<HTMLOListElement>(null);
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-current]');
    if (el && listRef.current) {
      listRef.current.scrollTop = el.offsetTop - listRef.current.offsetTop - 12;
    }
  }, [browsing.data, browseSeason]);

  if (series.isLoading) return <WatchSkeleton />;
  if (series.isError || !series.data)
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        <ErrorState error={series.error} onRetry={() => void series.refetch()} />
      </div>
    );

  const s = series.data.series;
  const seasons = playableSeasons(s.seasons);
  const episodes = current.data?.season.episodes ?? [];
  const ep = episodes.find((e) => e.number === episodeNo);
  const seasonIdx = seasons.findIndex((x) => x.season_number === seasonNo);
  const lastInSeason = seasons[seasonIdx]?.episode_count ?? episodes.length;

  const prev =
    episodeNo > 1
      ? { s: seasonNo, e: episodeNo - 1 }
      : seasonIdx > 0
        ? { s: seasons[seasonIdx - 1]!.season_number, e: seasons[seasonIdx - 1]!.episode_count }
        : null;
  const next =
    episodeNo < lastInSeason
      ? { s: seasonNo, e: episodeNo + 1 }
      : seasonIdx >= 0 && seasonIdx < seasons.length - 1
        ? { s: seasons[seasonIdx + 1]!.season_number, e: 1 }
        : null;

  const title = ep && !/^episode\s+\d+$/i.test(ep.title.trim()) ? ep.title : `Episode ${episodeNo}`;
  const meta = [formatDate(ep?.airDate), formatRuntime(ep?.runtimeMin)].filter(Boolean);
  const roomTitle = `moviebox:${id}:${seasonNo}:${episodeNo}`;

  return (
    <div className="px-4 pb-10 pt-5 sm:px-6 lg:px-10">
      <RecordTvVisit id={id} season={season} episode={episode} />
      <BackLink href={`/tv/${encodeURIComponent(id)}`}>{s.title}</BackLink>

      <div className="mt-5 grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <TvPlayback
            key={`${id}-${season}-${episode}`}
            id={id}
            season={season}
            episode={episode}
            title={`${s.title} S${seasonNo} E${episodeNo}`}
            seriesTitle={s.title}
            still={ep?.stillUrl ?? s.backdropUrl ?? null}
            belowPlayer={
              <motion.header
                key={`${seasonNo}-${episodeNo}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE_EXPO }}
                className="mt-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#f0abfc]">
                      {s.title} · Season {seasonNo}, Episode {episodeNo}
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                      {title}
                    </h1>
                    {meta.length ? (
                      <p className="mt-1 text-sm text-muted">{meta.join(' · ')}</p>
                    ) : null}
                  </div>
                  <nav aria-label="Episode navigation" className="flex shrink-0 gap-2">
                    <StepButton to={prev} seriesId={id} dir="prev" />
                    <StepButton to={next} seriesId={id} dir="next" />
                  </nav>
                </div>
                {roomTitleSchema.safeParse(roomTitle).success && (
                  <Button asChild variant="secondary" className="mt-4">
                    <Link href={`/rooms/new?movieId=${encodeURIComponent(roomTitle)}`}>
                      Watch together
                    </Link>
                  </Button>
                )}
                {ep?.overview ? (
                  <p className="mt-4 max-w-[72ch] text-[15px] leading-relaxed text-foreground/80">
                    {ep.overview}
                  </p>
                ) : null}
              </motion.header>
            }
          />
        </div>

        <aside
          aria-labelledby="season-list-title"
          className="min-w-0 xl:sticky xl:top-20 xl:self-start"
        >
          <div className="rounded-3xl bg-white/[0.025] p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] sm:p-4">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 id="season-list-title" className="font-display text-lg font-semibold">
                Episodes
              </h2>
              {browsing.data ? (
                <span className="text-xs text-muted">
                  {browsing.data.season.episodes.length} in season {browseSeason}
                </span>
              ) : null}
            </div>
            {seasons.length > 1 ? (
              <div className="mt-3">
                <SeasonTabs
                  seasons={seasons}
                  value={browseSeason}
                  onChange={setBrowseSeason}
                  size="sm"
                />
              </div>
            ) : null}
            <div className="mt-2">
              {browsing.isLoading ? (
                <EpisodeListSkeleton compact count={5} />
              ) : browsing.isError ? (
                <ErrorState
                  compact
                  error={browsing.error}
                  onRetry={() => void browsing.refetch()}
                />
              ) : (
                <ol
                  ref={listRef}
                  key={browseSeason}
                  className="scrollbar-none relative grid max-h-[min(70vh,44rem)] gap-1 overflow-y-auto overscroll-contain"
                >
                  {browsing.data?.season.episodes.map((e, i) => (
                    <EpisodeRow
                      key={e.id}
                      seriesId={id}
                      season={browseSeason}
                      episode={e}
                      index={i}
                      compact
                      current={browseSeason === seasonNo && e.number === episodeNo}
                    />
                  ))}
                </ol>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepButton({
  to,
  seriesId,
  dir,
}: {
  to: { s: number; e: number } | null;
  seriesId: string;
  dir: 'prev' | 'next';
}) {
  const label = dir === 'prev' ? 'Previous' : 'Next';
  const content = (
    <>
      {dir === 'prev' ? <ChevronLeft aria-hidden="true" /> : null}
      <span>
        {label}
        {to ? (
          <span className="ml-1.5 text-xs font-normal opacity-75">
            S{to.s} E{to.e}
          </span>
        ) : null}
      </span>
      {dir === 'next' ? <ChevronRight aria-hidden="true" /> : null}
    </>
  );
  if (!to)
    return (
      <Button variant="secondary" disabled aria-label={`No ${label.toLowerCase()} episode`}>
        {content}
      </Button>
    );
  return (
    <Button asChild variant={dir === 'next' ? 'primary' : 'secondary'}>
      <Link
        href={episodeHref(seriesId, to.s, to.e)}
        aria-label={`${label} episode: season ${to.s}, episode ${to.e}`}
        className={cn(dir === 'next' ? 'pr-3.5' : 'pl-3.5')}
      >
        {content}
      </Link>
    </Button>
  );
}

function WatchSkeleton() {
  return (
    <div className="px-4 pb-10 pt-5 sm:px-6 lg:px-10" aria-busy="true" aria-label="Loading episode">
      <span className="shimmer block h-9 w-40 rounded-full" />
      <div className="mt-5 grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <span className="shimmer block aspect-video rounded-2xl" />
          <span className="shimmer mt-5 block h-8 w-1/2 rounded-lg" />
        </div>
        <span className="shimmer hidden h-[32rem] rounded-3xl xl:block" />
      </div>
    </div>
  );
}
