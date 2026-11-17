'use client';

import { roomTvTitle, selectionTitle, type ExternalMedia, type RoomTvEpisode } from '@jandi/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { useProviderSeries, type SourceSeason } from '@/components/series/provider-series';
import { playableSeasons, useTvSeason, useTvSeries } from '@/components/series/tv-episodes';
import { Button } from '@/components/ui/button';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import { useChangeRoomMovie } from './room-dialogs';

type Props = {
  roomId: string;
  socket: Socket | null;
  engine: RoomSyncEngine | null;
  canControl: boolean;
  marathonActive: boolean;
};

/** Find the next actual provider entry, never infer an episode ID or cross a missing part. */
export function adjacentProviderEpisode(
  seasons: SourceSeason[],
  current: RoomTvEpisode,
  direction: -1 | 1,
) {
  if (current.numbering !== 'provider') return null;
  const parts = [...seasons].sort((a, b) => a.number - b.number);
  const partIndex = parts.findIndex((part) =>
    current.provider === 'kisskh' || current.provider === 'kisskh-direct'
      ? part.id === current.seriesId && part.number === current.season
      : part.number === current.season,
  );
  if (partIndex < 0) return null;
  const part = parts[partIndex]!;
  const episodes = [...part.episodes].sort((a, b) => a.number - b.number);
  const index = episodes.findIndex((episode) =>
    current.provider === 'kisskh' || current.provider === 'kisskh-direct'
      ? episode.id === current.episodeId && episode.number === current.episode
      : episode.number === current.episode,
  );
  if (index < 0) return null;
  const adjacentPart = episodes[index + direction] ? part : parts[partIndex + direction];
  const ordered = adjacentPart?.episodes.slice().sort((a, b) => a.number - b.number) ?? [];
  const adjacent =
    adjacentPart === part
      ? episodes[index + direction]
      : direction === 1
        ? ordered[0]
        : ordered.at(-1);
  if (!adjacentPart || !adjacent) return null;
  if (current.provider === 'kisskh' || current.provider === 'kisskh-direct') {
    if (!adjacentPart.id || !adjacent.id) return null;
    return {
      ...current,
      season: adjacentPart.number,
      episode: adjacent.number,
      seriesId: adjacentPart.id,
      episodeId: adjacent.id,
    };
  }
  return { ...current, season: adjacentPart.number, episode: adjacent.number };
}

export function nextProviderEpisode(seasons: SourceSeason[], current: RoomTvEpisode) {
  return adjacentProviderEpisode(seasons, current, 1);
}

function EpisodeButtons({
  title,
  previous,
  next,
  loading,
  error,
  retry,
  ...props
}: Props & {
  title: string;
  previous: string | null;
  next: string | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  const { change, busy } = useChangeRoomMovie(props.roomId, props.socket, props.engine);
  if (props.marathonActive) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-glass-1 px-4 py-3 text-sm">
      <span className="text-muted">{title}</span>
      {loading ? (
        <span className="text-muted">Loading episodes…</span>
      ) : error ? (
        <button type="button" onClick={retry} className="text-muted underline">
          Couldn’t load episodes · Try again
        </button>
      ) : props.canControl ? (
        <nav aria-label="Episode navigation" className="flex flex-wrap gap-2">
          {previous && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void change(previous, 'Previous episode selected for everyone')}
            >
              <ChevronLeft aria-hidden="true" /> Previous episode
            </Button>
          )}
          {next && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void change(next, 'Next episode selected for everyone')}
            >
              Next episode <ChevronRight aria-hidden="true" />
            </Button>
          )}
          {!previous && !next && <span className="text-muted">No other episodes listed</span>}
        </nav>
      ) : (
        <span className="text-muted">The host can choose an episode.</span>
      )}
    </div>
  );
}

export function ProviderEpisodeBar({ episode, ...props }: Props & { episode: RoomTvEpisode }) {
  const provider =
    episode.provider === 'kisskh' || episode.provider === 'kisskh-direct' ? 'kisskh' : 'moviebox';
  const catalog = useProviderSeries(provider, 'Money Heist');
  const next =
    !catalog.loading && !catalog.error ? nextProviderEpisode(catalog.seasons, episode) : null;
  const previous =
    !catalog.loading && !catalog.error
      ? adjacentProviderEpisode(catalog.seasons, episode, -1)
      : null;
  return (
    <EpisodeButtons
      {...props}
      title={`Money Heist · Part ${episode.season} E${episode.episode}`}
      previous={previous ? roomTvTitle(previous) : null}
      next={next ? roomTvTitle(next) : null}
      loading={catalog.loading}
      error={!!catalog.error}
      retry={catalog.retry}
    />
  );
}

export function VidsrcEpisodeBar({
  episode,
  ...props
}: Props & { episode: Extract<ExternalMedia, { type: 'tv' }> }) {
  const id = String(episode.tvId);
  const series = useTvSeries(id);
  const current = useTvSeason(id, episode.season);
  const nextSeason =
    playableSeasons(series.data?.series.seasons ?? []).find(
      (part) => part.season_number > episode.season,
    )?.season_number ?? null;
  const previousSeason =
    playableSeasons(series.data?.series.seasons ?? [])
      .filter((part) => part.season_number < episode.season)
      .sort((a, b) => b.season_number - a.season_number)[0]?.season_number ?? null;
  const episodes = [...(current.data?.season.episodes ?? [])].sort((a, b) => a.number - b.number);
  const index = episodes.findIndex((item) => item.number === episode.episode);
  const crossesSeason = index >= 0 && index === episodes.length - 1 && nextSeason !== null;
  const later = useTvSeason(id, crossesSeason ? nextSeason : null);
  const crossesPrevious = index === 0 && previousSeason !== null;
  const earlier = useTvSeason(id, crossesPrevious ? previousSeason : null);
  const previous =
    index < 0
      ? null
      : (episodes[index - 1] ??
        (crossesPrevious
          ? [...(earlier.data?.season.episodes ?? [])].sort((a, b) => a.number - b.number).at(-1)
          : null));
  const previousTarget = previous
    ? selectionTitle({
        provider: 'vidsrc',
        type: 'tv',
        tvId: episode.tvId,
        season: episodes[index - 1] ? episode.season : previousSeason!,
        episode: previous.number,
      })
    : null;
  const next =
    index < 0
      ? null
      : (episodes[index + 1] ??
        (crossesSeason
          ? [...(later.data?.season.episodes ?? [])].sort((a, b) => a.number - b.number)[0]
          : null));
  const season = episodes[index + 1] ? episode.season : nextSeason;
  const target =
    next && season !== null
      ? selectionTitle({
          provider: 'vidsrc',
          type: 'tv',
          tvId: episode.tvId,
          season,
          episode: next.number,
        })
      : null;
  const loading =
    series.isPending ||
    current.isPending ||
    (crossesSeason && later.isPending) ||
    (crossesPrevious && earlier.isPending);
  const error =
    series.isError ||
    current.isError ||
    (crossesSeason && later.isError) ||
    (crossesPrevious && earlier.isError);
  return (
    <EpisodeButtons
      {...props}
      title={`${series.data?.series.title ?? 'Series'} · S${episode.season} E${episode.episode}`}
      previous={previousTarget}
      next={target}
      loading={loading}
      error={error}
      retry={() => {
        void series.refetch();
        void current.refetch();
        if (crossesSeason) void later.refetch();
        if (crossesPrevious) void earlier.refetch();
      }}
    />
  );
}
