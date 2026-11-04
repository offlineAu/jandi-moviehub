'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { providerCatalogEpisode, parseRoomTvTitle, roomTvTitle } from '@jandi/shared';
import { useProviderSeries, type SeriesProvider } from '@/components/series/provider-series';
import { apiFetch } from '@/lib/api';
import { useTvSeason } from '@/components/series/tv-episodes';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';

type Series = { id: number; title: string };

export function SelectedRoomEpisode({
  value,
  onChange,
  onRemove,
}: {
  value: string;
  onChange: () => void;
  onRemove: () => void;
}) {
  const episode = parseRoomTvTitle(value)!;
  const provider = episode.provider === 'kisskh' ? 'KissKH' : 'MovieBox';
  const coordinate =
    episode.numbering === 'provider'
      ? providerCatalogEpisode(episode.season, episode.episode)
      : episode;
  const result = useTvSeason(episode.tvId, coordinate?.season ?? null);
  const title = coordinate
    ? result.data?.season.episodes.find((item) => item.number === coordinate.episode)?.title
    : `Episode ${episode.episode}`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-strong bg-secondary p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Money Heist · {episode.numbering === 'provider' ? 'Part ' : 'S'}
          {episode.season} E{episode.episode}
        </p>
        <p className="text-sm text-muted">{title ?? 'Loading episode…'}</p>
        <p className="text-xs text-muted">
          {provider} ·{' '}
          {episode.provider === 'kisskh'
            ? 'Shared episode · Individual playback'
            : 'Original Spanish · Synced playback'}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onChange}>
        Change
      </Button>
      <Button variant="ghost" size="sm" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}

export function TvRoomPicker({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (value: string) => void;
}) {
  const [series, setSeries] = React.useState<Series | null>(null);
  const [provider, setProvider] = React.useState<SeriesProvider>('kisskh');
  const [season, setSeason] = React.useState(1);
  React.useEffect(() => {
    setSeries(null);
    setSeason(1);
  }, [query]);
  const search = useQuery({
    queryKey: ['room-tv-search', query],
    queryFn: ({ signal }) =>
      apiFetch<{ items: Series[] }>('/tv/search', { query: { q: query }, signal }),
    enabled: query.length >= 2,
    retry: false,
  });
  const episodes = useProviderSeries(provider, 'Money Heist', series?.id === 71446);
  const part = episodes.seasons.find((part) => part.number === season) ?? episodes.seasons[0];
  if (query.length < 2) return null;
  return (
    <section className="mt-4 border-t border-white/10 pt-3" aria-label="TV series results">
      <p className="mb-2 text-xs font-medium text-muted">TV series</p>
      {search.isLoading ? (
        <p className="text-sm text-muted">Searching series…</p>
      ) : search.isError ? (
        <ErrorState compact error={search.error} onRetry={() => void search.refetch()} />
      ) : !series ? (
        <ul className="grid max-h-56 gap-1 overflow-y-auto">
          {search.data?.items.slice(0, 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.id !== 71446}
                onClick={() => setSeries(item)}
                className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left text-sm hover:bg-white/5 disabled:opacity-50"
              >
                <span>{item.title}</span>
                <span className="text-xs text-muted">
                  {item.id === 71446 ? 'Choose episode' : 'Room playback unavailable'}
                </span>
              </button>
            </li>
          ))}
          {!search.data?.items.length && (
            <li className="text-sm text-muted">No matching series.</li>
          )}
        </ul>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">{series.title}</p>
            <Button variant="ghost" size="sm" onClick={() => setSeries(null)}>
              Back to results
            </Button>
          </div>
          <div className="mb-3">
            <NativeSelect
              aria-label="Room playback provider"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as SeriesProvider);
                setSeason(1);
              }}
            >
              <option value="kisskh">KissKH · Individual playback</option>
              <option value="moviebox">MovieBox · Synced playback</option>
            </NativeSelect>
          </div>
          <NativeSelect
            aria-label="Episode season"
            value={part?.number ?? ''}
            disabled={episodes.loading || !!episodes.error || !episodes.seasons.length}
            onChange={(e) => setSeason(Number(e.target.value))}
          >
            {!episodes.seasons.length && (
              <option value="">
                {episodes.error
                  ? 'Parts unavailable'
                  : episodes.loading
                    ? 'Loading parts…'
                    : 'No parts available'}
              </option>
            )}
            {episodes.seasons.map((part) => (
              <option key={part.number} value={part.number}>
                {part.name} · {part.episodes.length} episodes
              </option>
            ))}
          </NativeSelect>
          <p className="my-2 text-xs text-muted">
            {provider === 'kisskh'
              ? 'KissKH shares the selected episode and room chat. Each viewer controls play, pause and seeking individually.'
              : 'MovieBox · Original Spanish. Play, pause and seeking are synchronized for everyone.'}
          </p>
          {episodes.loading ? (
            <p className="text-sm text-muted">Loading episodes…</p>
          ) : episodes.error ? (
            <ErrorState compact error={episodes.error} onRetry={episodes.retry} />
          ) : (
            <ul className="grid max-h-56 gap-1 overflow-y-auto">
              {part?.episodes.map((item) => (
                <li key={item.id ?? item.number}>
                  <button
                    type="button"
                    disabled={provider === 'kisskh' && (!part?.id || !item.id)}
                    onClick={() => {
                      const coordinate = {
                        tvId: '71446' as const,
                        season: part!.number,
                        episode: item.number,
                        numbering: 'provider' as const,
                      };
                      onSelect(
                        roomTvTitle(
                          provider === 'kisskh'
                            ? {
                                ...coordinate,
                                provider: 'kisskh',
                                seriesId: part!.id!,
                                episodeId: item.id!,
                              }
                            : coordinate,
                        ),
                      );
                    }}
                    className="w-full rounded-lg p-3 text-left text-sm hover:bg-white/5"
                  >
                    Episode {item.number}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
