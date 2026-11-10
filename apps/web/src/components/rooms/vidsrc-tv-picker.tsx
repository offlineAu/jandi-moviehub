'use client';
import * as React from 'react';
import { selectionTitle, type ExternalMedia } from '@jandi/shared';
import {
  useTvSeries,
  useTvSeason,
  playableSeasons,
  type TvEpisode,
} from '@/components/series/tv-episodes';
import { useRoomSourceCheck } from '@/lib/queries/room-sources';
import { NativeSelect } from '@/components/ui/native-select';
import { ErrorState } from '@/components/ui/error-state';
import { Artwork } from '@/components/movies/artwork';

function Episode({
  tvId,
  season,
  episode,
  onSelect,
}: {
  tvId: number;
  season: number;
  episode: TvEpisode;
  onSelect: (value: string) => void;
}) {
  const [checking, setChecking] = React.useState(false);
  const check = useRoomSourceCheck({ tvId, season, episode: episode.number }, checking);
  return (
    <li className="rounded-lg border border-border-strong p-2">
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left disabled:opacity-60"
        disabled={check.isFetching || check.data?.listed === false}
        onClick={async () => {
          setChecking(true);
          const result = await check.refetch();
          if (result.data?.listed)
            onSelect(
              selectionTitle({
                provider: 'vidsrc',
                type: 'tv',
                tvId,
                season,
                episode: episode.number,
              }),
            );
        }}
      >
        <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded">
          <Artwork src={episode.stillUrl} alt="" sizes="80px" fallbackTitle={episode.title} />
        </div>
        <span>
          Episode {episode.number} · {episode.title}
          <span className="block text-xs text-muted">
            {check.isFetching
              ? 'Checking source…'
              : check.data?.listed === false
                ? 'No source listed'
                : 'Check VidSrc and select'}
          </span>
        </span>
      </button>
      {check.isError && (
        <ErrorState compact error={check.error} onRetry={() => void check.refetch()} />
      )}
    </li>
  );
}
export function VidsrcTvPicker({
  tvId,
  onSelect,
}: {
  tvId: number;
  onSelect: (value: string) => void;
}) {
  const detail = useTvSeries(String(tvId));
  const [selected, setSelected] = React.useState<number | null>(null);
  const seasons = playableSeasons(detail.data?.series.seasons ?? []);
  const season = selected ?? seasons[0]?.season_number ?? null;
  const episodes = useTvSeason(String(tvId), season);
  if (detail.isError || episodes.isError)
    return (
      <ErrorState
        compact
        error={detail.error ?? episodes.error}
        onRetry={() => {
          void detail.refetch();
          void episodes.refetch();
        }}
      />
    );
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">
        VidSrc · Synchronized playback. A listed source still needs to load on each device.
      </p>
      <NativeSelect
        aria-label="Episode season"
        value={season ?? ''}
        disabled={!seasons.length}
        onChange={(e) => setSelected(Number(e.target.value))}
      >
        {!seasons.length && (
          <option value="">{detail.isPending ? 'Loading seasons…' : 'No seasons available'}</option>
        )}
        {seasons.map((part) => (
          <option key={part.season_number} value={part.season_number}>
            {part.name}
          </option>
        ))}
      </NativeSelect>
      {season !== null && episodes.isPending ? (
        <p>Loading episodes…</p>
      ) : (
        <ul className="grid max-h-64 gap-2 overflow-auto">
          {episodes.data?.season.episodes.map((episode) => (
            <Episode
              key={`${season}-${episode.number}`}
              tvId={tvId}
              season={season!}
              episode={episode}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
export function SelectedExternalEpisode({
  media,
}: {
  media: Extract<ExternalMedia, { type: 'tv' }>;
}) {
  const series = useTvSeries(String(media.tvId));
  return (
    <span className="min-w-0 flex-1 basis-48 break-words">
      {series.data?.series.title ?? 'TV series'} · S{media.season} E{media.episode} · VidSrc
      synchronized playback
    </span>
  );
}
