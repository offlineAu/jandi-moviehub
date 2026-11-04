'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { ExternalLink, Link2, Play, Star, Tv } from 'lucide-react';
import { motion } from 'motion/react';
import {
  EASE_EXPO,
  Magnetic,
  ParallaxBackdrop,
  Reveal,
  SplitWords,
  Stagger,
  StaggerItem,
  Tilt,
} from '@/components/motion';
import { Artwork } from '@/components/movies/artwork';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { fieldBase } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/error-state';
import { apiFetch, isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMe } from '@/lib/queries/auth';
import { SaveTvButton } from './saved-tv';
import { RecordTvVisit } from './recent-tv';
import { ProviderSeriesWatch } from './provider-series-watch';
import { matchesSeries } from './external-episodes';
import {
  EpisodeListSkeleton,
  EpisodeRow,
  SeasonTabs,
  episodeHref,
  playableSeasons,
  useTvSeason,
  useTvSeries,
} from './tv-episodes';

const LANGUAGES =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null;
function languageName(code: string) {
  try {
    return LANGUAGES?.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

type TvSummary = {
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  firstAirDate: string | null;
};
export function TvSearch({ query, showPopular = false }: { query: string; showPopular?: boolean }) {
  const q = query.trim();
  const popular = showPopular && !q;
  const result = useQuery({
    queryKey: ['tv-search', q, popular],
    queryFn: () =>
      apiFetch<{ items: TvSummary[] }>(popular ? '/tv/popular' : '/tv/search', {
        query: popular ? undefined : { q },
      }),
    enabled: q.length >= 2 || popular,
  });
  if (q.length < 2 && !popular) return null;
  return (
    <section className="mt-8" aria-live="polite">
      <h2 className="font-display text-xl font-semibold">
        {popular ? 'Popular TV' : 'TV metadata results'}
      </h2>
      {result.isLoading ? (
        <p className="mt-3 text-muted">Searching series…</p>
      ) : result.isError ? (
        <p className="mt-3 text-sm text-muted">
          {isApiError(result.error) && result.error.code === 'TV_METADATA_NOT_CONFIGURED'
            ? 'TV discovery is not configured.'
            : 'TV metadata could not be loaded. Try again.'}
        </p>
      ) : !result.data?.items.length ? (
        <p className="mt-3 text-sm text-muted">No matching TV series found.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            Metadata only; titles are not necessarily available to stream.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.items.map((item) => (
              <li key={item.id}>
                <Link
                  className="group/tv flex gap-4 rounded-2xl bg-white/[0.03] p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] transition-[background-color,transform,box-shadow] duration-300 ease-[var(--ease-expo)] hover:-translate-y-0.5 hover:bg-white/[0.06] hover:shadow-[inset_0_0_0_1px_rgb(168_85_247/0.4),0_16px_32px_-18px_rgb(168_85_247/0.5)] focus-ring"
                  href={`/tv/${item.id}`}
                >
                  <span className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 transition-transform duration-500 ease-[var(--ease-expo)] group-hover/tv:scale-105">
                    <Artwork src={item.posterUrl} alt="" fallbackTitle={item.title} sizes="64px" />
                  </span>
                  <span>
                    <span className="block font-semibold">{item.title}</span>
                    <span className="block text-sm text-muted">
                      TV series{item.firstAirDate ? ` · ${item.firstAirDate.slice(0, 4)}` : ''}
                    </span>
                    {item.originalTitle && item.originalTitle !== item.title ? (
                      <span className="block text-sm text-muted">{item.originalTitle}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
function ViewingOptions({ id }: { id: string }) {
  const [region, setRegion] = React.useState('PH');
  const valid = /^[A-Z]{2}$/.test(region);
  const result = useQuery({
    queryKey: ['availability', 'tv', id, region],
    queryFn: () =>
      apiFetch<{
        items: {
          provider: string;
          type: string;
          price: string | number | null;
          url: string | null;
        }[];
      }>(`/availability/tv/${encodeURIComponent(id)}`, { query: { region } }),
    enabled: valid,
    retry: false,
  });
  return (
    <Reveal>
      <section
        aria-labelledby="where-title"
        className="mt-14 rounded-3xl bg-white/[0.025] p-5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] sm:p-7"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="where-title" className="font-display text-xl font-semibold">
              Where to watch
            </h2>
            <p className="mt-1 text-sm text-muted">Streaming services that carry this series.</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="viewing-region" className="text-sm text-muted">
              Country
            </label>
            <input
              id="viewing-region"
              className={cn(
                fieldBase,
                'h-10 w-16 text-center font-semibold uppercase tracking-wider',
              )}
              maxLength={2}
              value={region}
              onChange={(e) => setRegion(e.target.value.toUpperCase())}
              aria-invalid={!valid}
              aria-describedby="viewing-region-hint"
            />
          </div>
        </div>
        <div className="mt-5">
          {!valid ? (
            <p id="viewing-region-hint" className="text-sm text-muted">
              Enter a two-letter country code, like PH or US.
            </p>
          ) : result.isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <span className="shimmer h-16 rounded-2xl" />
              <span className="shimmer h-16 rounded-2xl" />
            </div>
          ) : result.isError ? (
            <p className="text-sm text-muted">
              {isApiError(result.error) && result.error.code === 'AVAILABILITY_NOT_CONFIGURED'
                ? 'Viewing availability is not configured.'
                : 'Availability could not be checked for this region.'}
            </p>
          ) : !result.data?.items.length ? (
            <p className="text-sm text-muted">No streaming services reported for this country.</p>
          ) : (
            <>
              <ul className="grid gap-2 sm:grid-cols-2">
                {result.data.items.map((item, index) => (
                  <li
                    key={`${item.provider}-${item.type}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{item.provider}</span>
                      <span className="text-xs capitalize text-muted">
                        {item.type.toLowerCase()}
                        {item.price !== null ? ` · ${item.price}` : ''}
                      </span>
                    </span>
                    {item.url ? (
                      <Button asChild size="sm" variant="secondary">
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          Open
                          <ExternalLink aria-hidden="true" />
                        </a>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Availability may change; access and payment are set by each service. Powered by{' '}
                <a
                  href="https://www.watchmode.com/"
                  className="link-fx"
                  target="_blank"
                  rel="noreferrer"
                >
                  Watchmode
                </a>
                .
              </p>
            </>
          )}
        </div>
      </section>
    </Reveal>
  );
}

export function TvDetail({ id }: { id: string }) {
  const me = useMe();
  const [selected, setSelected] = React.useState<number | null>(null);
  const result = useTvSeries(id);
  const seasons = playableSeasons(result.data?.series.seasons ?? []);
  const signedIn = !!me.data && !me.data.isGuest;
  const recent = useQuery({
    queryKey: ['recent-tv'],
    queryFn: () =>
      apiFetch<{ items: { tmdbId: number; season: number | null; episode: number | null }[] }>(
        '/recent-tv',
      ),
    enabled: signedIn,
    retry: false,
  });
  const last = recent.data?.items.find(
    (v) => String(v.tmdbId) === id && v.season != null && v.episode != null,
  );
  const selectedSeason = selected ?? last?.season ?? seasons[0]?.season_number ?? null;
  const season = useTvSeason(id, selectedSeason);
  const seriesTitle = result.data?.series.title ?? '';
  const externalSearch = useQuery({
    queryKey: ['external-series-search', seriesTitle],
    queryFn: () =>
      apiFetch<{ items: { id: number; title: string }[] }>('/external-series/search', {
        query: { q: seriesTitle },
      }),
    enabled: seriesTitle.trim().length >= 2,
    retry: false,
    staleTime: 300000,
  });
  const sourceMatches = (externalSearch.data?.items ?? [])
    .filter((item) => matchesSeries(item.title, seriesTitle))
    .sort((a, b) => {
      const number = (name: string) => Number(name.match(/\b(?:season|part)\s*(\d+)/i)?.[1] ?? 0);
      return number(a.title) - number(b.title) || a.title.localeCompare(b.title);
    });
  const source =
    sourceMatches.find((item) =>
      new RegExp(`\\b(?:season|part)\\s*${selectedSeason}\\b`, 'i').test(item.title),
    ) ?? sourceMatches[0];
  // Warm the external source cache so the episode page starts faster.
  useQuery({
    queryKey: ['external-series', source?.id],
    queryFn: () => apiFetch(`/external-series/${source!.id}`),
    enabled: !!source,
    retry: false,
    staleTime: 300000,
  });

  if (result.isLoading) return <TvDetailSkeleton />;
  if (result.isError || !result.data)
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        <ErrorState error={result.error} onRetry={() => void result.refetch()} />
      </div>
    );
  const s = result.data.series;
  const year = s.firstAirDate?.slice(0, 4);
  const first = seasons[0];
  const play =
    id === '71446'
      ? { href: '/watch/tv/71446/season/1/episode/1', label: 'Choose provider episode' }
      : last
        ? {
            href: episodeHref(s.id, last.season!, last.episode!),
            label: `Continue S${last.season} E${last.episode}`,
          }
        : first
          ? {
              href: episodeHref(s.id, first.season_number, 1),
              label: `Play S${first.season_number} E1`,
            }
          : null;
  const copyLink = () =>
    void navigator.clipboard.writeText(window.location.href).then(
      () => toast.success('Series link copied'),
      () => toast.error('Could not copy the series link'),
    );

  return (
    <article className="relative pb-8">
      <RecordTvVisit id={id} />
      <BackLink href="/series" className="absolute left-4 top-5 z-10 sm:left-6 lg:left-10">
        All series
      </BackLink>
      {/* Backdrop */}
      <div
        className="film-grain relative -mb-48 h-[58vh] min-h-96 overflow-hidden sm:-mb-60 sm:h-[66vh]"
        aria-hidden="true"
      >
        <ParallaxBackdrop strength={0.22}>
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.08, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.4, ease: EASE_EXPO }}
          >
            <Artwork
              src={s.backdropUrl ?? s.posterUrl}
              alt=""
              sizes="100vw"
              priority
              kind="backdrop"
              className="object-[center_25%]"
            />
          </motion.div>
        </ParallaxBackdrop>
        <div className="absolute inset-0 shadow-[inset_0_0_160px_30px_rgb(0_0_0/0.6)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_8_16/0.85),rgb(8_8_16/0.3)_55%,transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_6%,rgb(8_8_16/0.75)_42%,rgb(8_8_16/0.25)_100%)]" />
      </div>

      <div className="relative z-[2] px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          <motion.div
            className="w-32 shrink-0 sm:w-48 lg:w-56"
            initial={{ opacity: 0, y: 40, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 1, ease: EASE_EXPO, delay: 0.1 }}
          >
            <Tilt className="rounded-xl" max={8}>
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-[var(--shadow-lift)] ring-1 ring-white/10">
                <Artwork
                  src={s.posterUrl}
                  alt={`Poster for ${s.title}`}
                  fallbackTitle={s.title}
                  sizes="(min-width: 1024px) 224px, 192px"
                  priority
                />
              </div>
            </Tilt>
          </motion.div>
          <Stagger immediate stagger={0.08} delay={0.2} className="min-w-0 flex-1 pb-1">
            <StaggerItem className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-iris/15 px-2.5 py-1 text-xs font-medium text-[#7dd3fc]">
                <Tv className="size-3.5" aria-hidden="true" />
                Series
              </span>
              {seasons.length ? (
                <span className="text-foreground/75">
                  {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}
                </span>
              ) : null}
            </StaggerItem>
            <h1 className="font-display text-[clamp(2.25rem,6vw,4.25rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              <SplitWords text={s.title} delay={0.15} />
            </h1>
            {s.originalTitle && s.originalTitle !== s.title ? (
              <StaggerItem as="p" className="mt-2 text-foreground/65">
                {s.originalTitle}
              </StaggerItem>
            ) : null}
            <StaggerItem className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground/85">
              {s.rating != null && s.voteCount ? (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                  <span className="font-semibold">{s.rating.toFixed(1)}</span>
                  <span className="text-muted">/10 · {s.voteCount.toLocaleString()} votes</span>
                </span>
              ) : null}
              {year ? <span>{year}</span> : null}
              {s.originalLanguage ? <span>{languageName(s.originalLanguage)}</span> : null}
            </StaggerItem>
            {s.genres?.length ? (
              <StaggerItem as="div">
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Genres">
                  {s.genres.map((g) => (
                    <li
                      key={g}
                      className="inline-flex h-7 items-center rounded-full bg-white/[0.05] px-3 text-xs font-medium text-foreground/90 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]"
                    >
                      {g}
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            ) : null}
          </Stagger>
        </div>

        <Reveal immediate delay={0.5} y={16} className="mt-8 flex flex-wrap items-center gap-3">
          {play ? (
            <Magnetic>
              <Button asChild size="lg">
                <Link href={play.href}>
                  <Play className="fill-current" aria-hidden="true" />
                  {play.label}
                </Link>
              </Button>
            </Magnetic>
          ) : null}
          <SaveTvButton id={s.id} />
          <Button variant="secondary" size="icon" onClick={copyLink} aria-label="Copy series link">
            <Link2 aria-hidden="true" />
          </Button>
        </Reveal>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-14">
          <Reveal>
            <h2 className="font-display text-xl font-semibold">Overview</h2>
            <p className="mt-3 max-w-[68ch] text-base leading-relaxed text-foreground/85">
              {s.overview || 'No synopsis available.'}
            </p>
          </Reveal>
          {s.cast.length ? (
            <Reveal delay={0.1}>
              <h2 className="font-display text-xl font-semibold">Starring</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {s.cast.slice(0, 10).map((m) => (
                  <li
                    key={m.name}
                    className="rounded-full bg-white/[0.04] px-3 py-1.5 text-sm shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
                  >
                    {m.name}
                    {m.character ? <span className="text-muted"> · {m.character}</span> : null}
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}
        </div>

        {id === '71446' ? (
          <section className="mt-14" aria-label="Provider episodes">
            <ProviderSeriesWatch season="1" episode="1" browseOnly />
          </section>
        ) : (
          <>
            <section aria-labelledby="episodes-title" className="mt-14">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2
                    id="episodes-title"
                    className="font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl"
                  >
                    Episodes
                  </h2>
                  {season.data ? (
                    <p className="mt-1 text-sm text-muted">
                      {season.data.season.name} · {season.data.season.episodes.length}{' '}
                      {season.data.season.episodes.length === 1 ? 'episode' : 'episodes'}
                    </p>
                  ) : null}
                </div>
              </div>
              {seasons.length > 1 ? (
                <div className="mt-4">
                  <SeasonTabs seasons={seasons} value={selectedSeason} onChange={setSelected} />
                </div>
              ) : null}
              <div className="mt-4" role="tabpanel" aria-labelledby="episodes-title">
                {selectedSeason === null ? (
                  <p className="text-muted">No seasons are listed for this series.</p>
                ) : season.isLoading ? (
                  <EpisodeListSkeleton />
                ) : season.isError ? (
                  <ErrorState error={season.error} onRetry={() => void season.refetch()} />
                ) : season.data?.season.episodes.length ? (
                  <ol key={selectedSeason} className="grid gap-1.5">
                    {season.data.season.episodes.map((e, i) => (
                      <EpisodeRow
                        key={e.id}
                        seriesId={s.id}
                        season={selectedSeason}
                        episode={e}
                        index={i}
                        current={last?.season === selectedSeason && last?.episode === e.number}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted">No episodes are listed for this season.</p>
                )}
              </div>
            </section>
          </>
        )}

        <ViewingOptions id={id} />
      </div>
    </article>
  );
}

function TvDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading series">
      <div className="h-[50vh] min-h-80 bg-[radial-gradient(80%_60%_at_60%_10%,#1b1430,transparent)]" />
      <div className="-mt-40 flex flex-col gap-6 px-4 sm:flex-row sm:px-6 lg:px-10">
        <span className="shimmer aspect-[2/3] w-32 rounded-xl sm:w-48" />
        <span className="grid flex-1 content-end gap-3 pb-2">
          <span className="shimmer h-12 w-2/3 rounded-lg" />
          <span className="shimmer h-4 w-1/2 rounded" />
          <span className="shimmer h-12 w-48 rounded-full" />
        </span>
      </div>
    </div>
  );
}
