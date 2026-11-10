'use client';

import { roomTvTitle, selectionTitle, type ExternalMedia, type RoomTvEpisode } from '@jandi/shared';
import { ChevronRight } from 'lucide-react';
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
export function nextProviderEpisode(seasons: SourceSeason[], current: RoomTvEpisode) {
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
  const nextPart = index + 1 < episodes.length ? part : parts[partIndex + 1];
  const next =
    nextPart === part
      ? episodes[index + 1]
      : nextPart?.episodes.slice().sort((a, b) => a.number - b.number)[0];
  if (!nextPart || !next) return null;
  if (current.provider === 'kisskh' || current.provider === 'kisskh-direct') {
    if (!nextPart.id || !next.id) return null;
    return {
      ...current,
      season: nextPart.number,
      episode: next.number,
      seriesId: nextPart.id,
      episodeId: next.id,
    };
  }
  return { ...current, season: nextPart.number, episode: next.number };
}

function NextButton({
  title,
  target,
  loading,
  error,
  retry,
  ...props
}: Props & {
  title: string;
  target: string | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  const { change, busy } = useChangeRoomMovie(props.roomId, props.socket, props.engine);
  if (props.marathonActive) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm">
      <span className="text-muted">{title}</span>
      {loading ? (
        <span className="text-muted">Loading next episode…</span>
      ) : error ? (
        <button type="button" onClick={retry} className="text-muted underline">
          Couldn’t load episodes · Try again
        </button>
      ) : target ? (
        props.canControl ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void change(target, 'Next episode selected for everyone')}
          >
            {busy ? 'Changing episode…' : 'Next episode'} <ChevronRight aria-hidden="true" />
          </Button>
        ) : (
          <span className="text-muted">The host can choose the next episode.</span>
        )
      ) : (
        <span className="text-muted">No next episode listed</span>
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
  return (
    <NextButton
      {...props}
      title={`Money Heist · Part ${episode.season} E${episode.episode}`}
      target={next ? roomTvTitle(next) : null}
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
  const episodes = [...(current.data?.season.episodes ?? [])].sort((a, b) => a.number - b.number);
  const index = episodes.findIndex((item) => item.number === episode.episode);
  const crossesSeason = index >= 0 && index === episodes.length - 1 && nextSeason !== null;
  const later = useTvSeason(id, crossesSeason ? nextSeason : null);
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
  const loading = series.isPending || current.isPending || (crossesSeason && later.isPending);
  const error = series.isError || current.isError || (crossesSeason && later.isError);
  return (
    <NextButton
      {...props}
      title={`${series.data?.series.title ?? 'Series'} · S${episode.season} E${episode.episode}`}
      target={target}
      loading={loading}
      error={error}
      retry={() => {
        void series.refetch();
        void current.refetch();
        if (crossesSeason) void later.refetch();
      }}
    />
  );
}
