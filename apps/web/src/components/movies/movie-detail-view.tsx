'use client';

import { selectionTitle } from '@jandi/shared';
import { useRoomSourceCapabilities } from '@/lib/queries/room-sources';
import { Ban, Clapperboard, Play, Star, Users } from 'lucide-react';
import Link from 'next/link';
import {
  Magnetic,
  ParallaxBackdrop,
  PosterMorph,
  Reveal,
  SplitWords,
  Stagger,
  StaggerItem,
  Tilt,
  EASE_EXPO,
} from '@/components/motion';
import { formatTime } from '@/components/player/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMe } from '@/lib/queries/auth';
import { useGenres, useMovie, useRecommendations, useSimilar } from '@/lib/queries/catalog';
import { useLibraryStatus } from '@/lib/queries/library';
import type { MovieDetail } from '@/lib/types';
import { formatDate, formatRating, formatRuntime } from '@/lib/utils';
import { Artwork } from './artwork';
import { CastRow } from './cast-row';
import { LibraryActions } from './movie-actions';
import { MovieRail } from './movie-rail';
import { TrailerEmbed } from './trailer-embed';

const LANGUAGE_NAMES =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null;

function languageName(code: string | null) {
  if (!code) return null;
  try {
    return LANGUAGE_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

function WatchButton({
  movie,
  signedIn,
  isGuest,
  thirdParty = false,
}: {
  movie: MovieDetail;
  signedIn: boolean;
  isGuest: boolean;
  thirdParty?: boolean;
}) {
  const status = useLibraryStatus(movie.id, signedIn && !isGuest);
  const progress = status.data?.progress;
  const resumable = progress && !progress.completed && progress.positionSec >= 30;
  if (!signedIn) {
    return (
      <Button asChild size="lg">
        <Link href={`/login?next=${encodeURIComponent(`/watch/${movie.id}`)}`}>
          <Play className="fill-current" aria-hidden="true" />
          Log in to watch
        </Link>
      </Button>
    );
  }
  if (isGuest) {
    return (
      <Button asChild size="lg">
        <Link href="/register">
          <Play className="fill-current" aria-hidden="true" />
          Create an account to watch
        </Link>
      </Button>
    );
  }
  return (
    <Magnetic>
      <Button asChild size="lg">
        <Link href={`/watch/${movie.id}`}>
          <Play className="fill-current" aria-hidden="true" />
          {thirdParty
            ? 'Try third-party player'
            : resumable
              ? `Resume from ${formatTime(progress.positionSec)}`
              : 'Watch now'}
        </Link>
      </Button>
    </Magnetic>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading movie">
      <div className="h-[46vh] min-h-72 bg-[radial-gradient(80%_60%_at_60%_10%,#1b1430,transparent)]" />
      <div className="-mt-40 flex flex-col gap-6 px-4 sm:flex-row sm:px-6 lg:px-10">
        <Skeleton className="aspect-[2/3] w-40 rounded-xl sm:w-56" />
        <div className="grid flex-1 content-end gap-3 pb-2">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full max-w-2xl" />
        </div>
      </div>
    </div>
  );
}

export function MovieDetailView({ id }: { id: string }) {
  const me = useMe();
  const roomCapabilities = useRoomSourceCapabilities();
  const movieQuery = useMovie(id);
  const similar = useSimilar(id);
  const recommendations = useRecommendations(id);
  const genres = useGenres();
  const external = useQuery({
    queryKey: ['external-source', id],
    queryFn: () =>
      apiFetch<{ available: boolean; embedUrl: string | null }>(
        `/movies/${encodeURIComponent(id)}/external-source`,
      ),
    enabled: !!movieQuery.data && !movieQuery.data.playable,
    staleTime: 300000,
    retry: false,
  });

  if (movieQuery.isLoading) return <DetailSkeleton />;
  if (movieQuery.isError || !movieQuery.data) {
    const notFound =
      isApiError(movieQuery.error) &&
      (movieQuery.error.status === 404 || movieQuery.error.status === 400);
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        {notFound ? (
          <EmptyState
            icon={Clapperboard}
            title="We couldn’t find this movie"
            description="It may have been removed from the catalog, or the link is wrong."
            action={
              <Button asChild variant="secondary">
                <Link href="/browse">Browse movies</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="This movie didn’t load"
            error={movieQuery.error}
            onRetry={() => void movieQuery.refetch()}
            retrying={movieQuery.isFetching}
          />
        )}
      </div>
    );
  }

  const movie = movieQuery.data;
  const user = me.data;
  const rating = formatRating(movie.voteAverage);
  const runtime = formatRuntime(movie.runtimeMin);
  const released = formatDate(movie.releaseDate);
  const language = languageName(movie.originalLanguage);
  const slugFor = (name: string) => genres.data?.items.find((g) => g.name === name)?.slug;
  const attribution = [movie.attribution, movie.license?.attribution].filter(
    (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
  );

  return (
    <article className="pb-4">
      {/* Backdrop header */}
      <div
        className="film-grain relative -mb-44 h-[52vh] min-h-80 overflow-hidden sm:-mb-56 sm:h-[60vh]"
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
              src={movie.backdropUrl ?? movie.posterUrl}
              alt=""
              sizes="100vw"
              priority
              kind="backdrop"
              className="object-[center_25%]"
            />
          </motion.div>
        </ParallaxBackdrop>
        <div className="absolute inset-0 shadow-[inset_0_0_160px_30px_rgb(0_0_0/0.6)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_8%,rgb(8_8_16/0.75)_45%,rgb(8_8_16/0.35)_100%)]" />
      </div>

      <div className="relative z-[2] px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          <motion.div
            className="w-36 shrink-0 sm:w-52 lg:w-60"
            initial={{ opacity: 0, y: 40, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 1, ease: EASE_EXPO, delay: 0.1 }}
          >
            <Tilt className="rounded-xl" max={8}>
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-[var(--shadow-lift)] ring-1 ring-white/10">
                <PosterMorph id={movie.id}>
                  <div className="absolute inset-0">
                    <Artwork
                      src={movie.posterUrl}
                      alt={`Poster for ${movie.title}`}
                      sizes="(min-width: 1024px) 240px, 208px"
                      priority
                      fallbackTitle={movie.title}
                    />
                  </div>
                </PosterMorph>
              </div>
            </Tilt>
          </motion.div>
          <Stagger immediate stagger={0.08} delay={0.25} className="min-w-0 flex-1 pb-1">
            <StaggerItem className="mb-3 flex flex-wrap gap-2">
              {movie.playable ? <Badge variant="playable">Playable</Badge> : null}
              {movie.isDemo ? <Badge variant="demo">Demo title</Badge> : null}
            </StaggerItem>
            <h1 className="font-display text-[clamp(2.25rem,6vw,4.25rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              <SplitWords text={movie.title} delay={0.2} />
            </h1>
            {movie.tagline ? (
              <StaggerItem as="p" className="mt-2 text-lg italic text-foreground/75">
                {movie.tagline}
              </StaggerItem>
            ) : null}
            <StaggerItem>
              <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-foreground/85">
                {rating ? (
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Rating</dt>
                    <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                    <dd>
                      <span className="font-semibold">{rating}</span>
                      <span className="text-muted">
                        /10{movie.voteCount ? ` · ${movie.voteCount.toLocaleString()} votes` : ''}
                      </span>
                    </dd>
                  </div>
                ) : null}
                {released ? (
                  <div>
                    <dt className="sr-only">Released</dt>
                    <dd>{released}</dd>
                  </div>
                ) : movie.year ? (
                  <div>
                    <dt className="sr-only">Year</dt>
                    <dd>{movie.year}</dd>
                  </div>
                ) : null}
                {runtime ? (
                  <div>
                    <dt className="sr-only">Runtime</dt>
                    <dd>{runtime}</dd>
                  </div>
                ) : null}
                {language ? (
                  <div>
                    <dt className="sr-only">Original language</dt>
                    <dd>{language}</dd>
                  </div>
                ) : null}
              </dl>
            </StaggerItem>
            {movie.genres.length ? (
              <StaggerItem as="div">
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Genres">
                  {movie.genres.map((g) => {
                    const slug = slugFor(g);
                    return (
                      <li key={g}>
                        {slug ? (
                          <Link
                            href={`/browse?genre=${encodeURIComponent(slug)}`}
                            className="inline-flex h-7 items-center rounded-full border border-border-strong px-3 text-xs font-medium text-foreground/90 transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 focus-ring"
                          >
                            {g}
                          </Link>
                        ) : (
                          <span className="inline-flex h-7 items-center rounded-full border border-border-strong px-3 text-xs font-medium text-foreground/90">
                            {g}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </StaggerItem>
            ) : null}
          </Stagger>
        </div>

        {/* Actions */}
        <Reveal immediate delay={0.55} y={16} className="mt-8 flex flex-wrap items-center gap-3">
          {movie.playable || external.data?.available ? (
            <WatchButton
              movie={movie}
              signedIn={!!user}
              isGuest={!!user?.isGuest}
              thirdParty={!movie.playable}
            />
          ) : null}
          {me.isLoading ? (
            <Skeleton className="h-12 w-40 rounded-xl" />
          ) : (
            <LibraryActions movie={movie} me={user} />
          )}
          {movie.playable || (roomCapabilities.data?.vidsrcSync && external.data?.available) ? (
            <Button asChild variant="outline" size="lg">
              <Link
                href={`/rooms/new?movieId=${encodeURIComponent(movie.playable ? movie.id : selectionTitle({ provider: 'vidsrc', type: 'movie', movieId: movie.id }))}`}
              >
                <Users aria-hidden="true" />
                Start a watch party
              </Link>
            </Button>
          ) : null}
        </Reveal>
        {!movie.playable && !external.data?.available ? (
          <div className="mt-5 flex max-w-2xl gap-3 rounded-xl border border-border-strong bg-secondary/80 px-4 py-3 text-sm">
            <Ban className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
            <p>
              <span className="font-medium">Not available to stream.</span>{' '}
              <span className="text-muted">
                No playable source is currently available. Try again later.
              </span>
            </p>
          </div>
        ) : null}

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-14">
          <Reveal>
            <section aria-labelledby="overview-title">
              <h2 id="overview-title" className="font-display text-xl font-semibold">
                Overview
              </h2>
              <p className="mt-3 max-w-[68ch] text-base leading-relaxed text-foreground/85">
                {movie.overview || 'No overview is available for this title yet.'}
              </p>
              {attribution.length || movie.license ? (
                <div className="mt-6 grid gap-1 text-xs text-muted">
                  {attribution.map((a) => (
                    <p key={a}>{a}</p>
                  ))}
                  {movie.license ? (
                    <p>
                      Licensed via {movie.license.licensor} (
                      {movie.license.type.replace(/_/g, ' ').toLowerCase()})
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          </Reveal>

          {movie.trailers.length ? (
            <Reveal delay={0.1} blur>
              <section aria-labelledby="trailers-title">
                <h2 id="trailers-title" className="font-display text-xl font-semibold">
                  {movie.trailers.length === 1 ? 'Trailer' : 'Trailers'}
                </h2>
                <ul className="mt-3 grid gap-4">
                  {movie.trailers.slice(0, 3).map((t) => (
                    <li key={`${t.site}-${t.key}`}>
                      <TrailerEmbed trailer={t} />
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          ) : null}
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-10">
        <CastRow cast={movie.cast} />
        <MovieRail
          title="More like this"
          movies={similar.data?.items}
          isLoading={similar.isLoading}
          error={similar.error}
          onRetry={() => void similar.refetch()}
        />
        <MovieRail
          title="Recommended for you"
          movies={recommendations.data?.items}
          isLoading={recommendations.isLoading}
          error={recommendations.error}
          onRetry={() => void recommendations.refetch()}
        />
      </div>
    </article>
  );
}
