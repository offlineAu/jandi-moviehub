'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseRoomTvTitle, roomTvTitle } from '@jandi/shared';
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
  const result = useTvSeason(episode.tvId, episode.season);
  const title = result.data?.season.episodes.find((item) => item.number === episode.episode)?.title;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-strong bg-secondary p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Money Heist · S{episode.season} E{episode.episode}
        </p>
        <p className="text-sm text-muted">{title ?? 'Loading episode…'}</p>
        <p className="text-xs text-muted">MovieBox · Original Spanish · Synced playback</p>
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
  const [season, setSeason] = React.useState(2);
  React.useEffect(() => {
    setSeries(null);
    setSeason(2);
  }, [query]);
  const search = useQuery({
    queryKey: ['room-tv-search', query],
    queryFn: ({ signal }) =>
      apiFetch<{ items: Series[] }>('/tv/search', { query: { q: query }, signal }),
    enabled: query.length >= 2,
    retry: false,
  });
  const episodes = useTvSeason('71446', series?.id === 71446 ? season : null);
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
          <NativeSelect
            aria-label="Episode season"
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
          >
            <option value="2">Season 2</option>
            <option value="3">Season 3</option>
          </NativeSelect>
          <p className="my-2 text-xs text-muted">
            MovieBox · Original Spanish. Season 1 uses a different cut and is not available in rooms
            yet.
          </p>
          {episodes.isLoading ? (
            <p className="text-sm text-muted">Loading episodes…</p>
          ) : episodes.isError ? (
            <ErrorState compact error={episodes.error} onRetry={() => void episodes.refetch()} />
          ) : (
            <ul className="grid max-h-56 gap-1 overflow-y-auto">
              {episodes.data?.season.episodes.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(
                        roomTvTitle({
                          tvId: '71446',
                          season: season as 2 | 3,
                          episode: item.number,
                        }),
                      )
                    }
                    className="w-full rounded-lg p-3 text-left text-sm hover:bg-white/5"
                  >
                    Episode {item.number} · {item.title}
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
