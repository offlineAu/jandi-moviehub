'use client';

import * as React from 'react';
import Link from 'next/link';
import { roomTvTitle } from '@jandi/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { Artwork } from '@/components/movies/artwork';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { ErrorState } from '@/components/ui/error-state';
import { cn } from '@/lib/utils';
import { MovieboxPlayer } from './moviebox-player';
import { useTvSeason, useTvSeries } from './tv-episodes';
import {
  providerWatchHref,
  sourceArtworkEpisode,
  useProviderSeries,
  type SeriesProvider,
} from './provider-series';

/** Playback identity, counts and navigation come from the provider; TMDB supplies artwork only. */
type ProviderWatchProps = { season: string; episode: string; browseOnly?: boolean };

export function ProviderSeriesWatch(props: ProviderWatchProps) {
  return (
    <React.Suspense fallback={<p role="status">Loading provider episodes…</p>}>
      <ProviderSeriesWatchContent {...props} />
    </React.Suspense>
  );
}

function ProviderSeriesWatchContent({ season, episode, browseOnly = false }: ProviderWatchProps) {
  const params = useSearchParams();
  const router = useRouter();
  const initialProvider: SeriesProvider =
    params.get('provider') === 'moviebox' ? 'moviebox' : 'kisskh';
  const [provider, setProvider] = React.useState<SeriesProvider>(initialProvider);
  React.useEffect(() => setProvider(initialProvider), [initialProvider]);
  const nativeLink = params.get('numbering') === 'provider';
  // Old catalog links must not be silently interpreted as a different episode.
  const selectedPart = nativeLink ? Number(season) : null;
  const selectedEpisode = nativeLink ? Number(episode) : null;
  const [browsePart, setBrowsePart] = React.useState<number | null>(selectedPart);
  React.useEffect(() => setBrowsePart(selectedPart), [selectedPart, provider]);
  const [attempt, setAttempt] = React.useState(0);
  const sources = useProviderSeries(provider, 'Money Heist');
  const series = useTvSeries('71446');
  // These optional queries enrich artwork; failure never replaces the provider's episode list.
  const seasonTwo = useTvSeason('71446', 2);
  const seasonThree = useTvSeason('71446', 3);
  const title = series.data?.series.title ?? 'Money Heist';
  const fallbackImage = series.data?.series.backdropUrl ?? series.data?.series.posterUrl ?? null;
  const currentPart = sources.seasons.find((part) => part.number === selectedPart);
  const current = currentPart?.episodes.find((item) => item.number === selectedEpisode);
  const browsed = sources.seasons.find((part) => part.number === browsePart) ?? sources.seasons[0];
  const artwork = (part: number, number: number) => {
    const coordinate = sourceArtworkEpisode(part, number);
    const data = coordinate?.season === 2 ? seasonTwo.data : seasonThree.data;
    return coordinate
      ? data?.season.episodes.find((item) => item.number === coordinate.episode)
      : undefined;
  };
  const currentArt =
    selectedPart && selectedEpisode ? artwork(selectedPart, selectedEpisode) : undefined;
  const allEpisodes = sources.seasons.flatMap((part) =>
    part.episodes.map((item) => ({ part: part.number, ...item })),
  );
  const currentIndex = allEpisodes.findIndex(
    (item) => item.part === selectedPart && item.number === selectedEpisode,
  );
  const previous = currentIndex > 0 ? allEpisodes[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? allEpisodes[currentIndex + 1] : undefined;
  const providerName = provider === 'moviebox' ? 'MovieBox' : 'KissKH';
  const selectedLabel = current
    ? `${title} · ${providerName} · Part ${selectedPart}, Episode ${selectedEpisode}`
    : title;

  return (
    <div className={browseOnly ? '' : 'px-4 pb-10 pt-5 sm:px-6 lg:px-10'}>
      {!browseOnly && <BackLink href="/tv/71446">{title}</BackLink>}
      <div className="my-5 max-w-xs">
        <NativeSelect
          aria-label="Playback provider"
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as SeriesProvider);
            setAttempt(0);
            if (!browseOnly)
              router.replace(`/watch/tv/71446/season/1/episode/1?provider=${event.target.value}`);
          }}
        >
          <option value="kisskh">KissKH</option>
          <option value="moviebox">MovieBox · Original Spanish</option>
        </NativeSelect>
      </div>
      <div className={browseOnly ? 'grid gap-8' : 'grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]'}>
        {!browseOnly && (
          <div className="min-w-0">
            {sources.loading ? (
              <div
                role="status"
                className="grid aspect-video place-items-center rounded-2xl bg-black text-muted"
              >
                Loading {providerName} episodes…
              </div>
            ) : sources.error ? (
              <ErrorState
                className="aspect-video"
                title={`${providerName} is unavailable`}
                error={sources.error}
                onRetry={sources.retry}
              />
            ) : current ? (
              provider === 'moviebox' ? (
                <MovieboxPlayer
                  key={`${selectedPart}-${selectedEpisode}`}
                  id="71446"
                  season={String(selectedPart)}
                  episode={String(selectedEpisode)}
                  numbering="provider"
                />
              ) : (
                <>
                  <div className="aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
                    <iframe
                      key={`${current.id}-${attempt}`}
                      className="size-full"
                      src={`https://kisskh.megaplay.su/kisskh/${current.id}`}
                      title={`${selectedLabel} player`}
                      allow="fullscreen; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    <RotateCw aria-hidden="true" /> Reload player
                  </Button>
                </>
              )
            ) : (
              <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-black p-6 text-center ring-1 ring-white/10">
                <Artwork
                  src={fallbackImage}
                  alt=""
                  kind="backdrop"
                  sizes="100vw"
                  className="opacity-25"
                />
                <p role="status" className="relative max-w-md">
                  {nativeLink
                    ? `This episode is not listed by ${providerName}. Choose an episode from its list.`
                    : 'Choose a provider part and episode to start watching. The list follows the provider’s numbering.'}
                </p>
              </div>
            )}
            <header className="mt-5">
              <p className="text-sm font-medium text-[#f0abfc]">{selectedLabel}</p>
              <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
                {current
                  ? (currentArt?.title ?? `Episode ${selectedEpisode}`)
                  : 'Choose an episode'}
              </h1>
              <nav aria-label="Episode navigation" className="mt-4 flex flex-wrap gap-2">
                {previous ? (
                  <Button asChild variant="secondary">
                    <Link href={providerWatchHref(provider, previous.part, previous.number)}>
                      <ChevronLeft aria-hidden="true" />
                      Previous P{previous.part} E{previous.number}
                    </Link>
                  </Button>
                ) : (
                  <Button variant="secondary" disabled>
                    Previous
                  </Button>
                )}
                {next ? (
                  <Button asChild>
                    <Link href={providerWatchHref(provider, next.part, next.number)}>
                      Next P{next.part} E{next.number}
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                ) : (
                  <Button disabled>Next</Button>
                )}
              </nav>
              {current && provider === 'moviebox' && (
                <Button asChild variant="secondary" className="mt-3">
                  <Link
                    href={`/rooms/new?movieId=${encodeURIComponent(roomTvTitle({ tvId: '71446', season: selectedPart!, episode: selectedEpisode!, numbering: 'provider' }))}`}
                  >
                    Watch together
                  </Link>
                </Button>
              )}
              <p className="mt-4 text-xs text-muted">
                Episode order follows {providerName}. Thumbnails use TMDB artwork; series artwork is
                shown when an episode still cannot be matched.
              </p>
            </header>
          </div>
        )}
        <aside
          aria-label={`${providerName} episodes`}
          className="min-w-0 xl:sticky xl:top-20 xl:self-start"
        >
          <div className="rounded-3xl bg-white/[0.025] p-4 ring-1 ring-white/10">
            <h2 className="font-display text-lg font-semibold">{providerName} episodes</h2>
            {sources.error ? (
              <p className="mt-3 text-sm text-muted">
                Choose another provider or retry to load its episode list.
              </p>
            ) : (
              <>
                <div className="my-3">
                  <NativeSelect
                    aria-label="Provider part"
                    value={browsed?.number ?? ''}
                    onChange={(event) => setBrowsePart(Number(event.target.value))}
                  >
                    {!sources.seasons.length && <option value="">No parts available</option>}
                    {sources.seasons.map((part) => (
                      <option key={part.id ?? part.number} value={part.number}>
                        {part.name} · {part.episodes.length} episodes
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {!sources.loading && !sources.seasons.length && (
                  <p className="text-sm text-muted">No matching series was found.</p>
                )}
                <ol className="grid max-h-[70vh] gap-2 overflow-y-auto">
                  {browsed?.episodes.map((item) => {
                    const image = artwork(browsed.number, item.number);
                    const active =
                      current && browsed.number === selectedPart && item.number === selectedEpisode;
                    return (
                      <li key={item.id ?? item.number}>
                        <Link
                          href={providerWatchHref(provider, browsed.number, item.number)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-xl border p-2 focus-ring',
                            active
                              ? 'border-primary bg-primary/10'
                              : 'border-transparent hover:bg-white/5',
                          )}
                        >
                          <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg">
                            <Artwork
                              src={image?.stillUrl ?? fallbackImage}
                              alt={image?.stillUrl ? '' : `${title} series artwork`}
                              kind="backdrop"
                              sizes="96px"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-muted">
                              Part {browsed.number} · Episode {item.number}
                              {active ? ' · Now playing' : ''}
                            </p>
                            <p className="truncate text-sm font-medium">
                              {image?.title ?? `Episode ${item.number}`}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
