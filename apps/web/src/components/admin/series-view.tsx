'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, errorMessage } from '@/lib/api';
import { TvMediaLink } from './tv-media-link';

type Series = { id: string; title: string; country: string; description: string };
type Movie = { id: string; title: string };
type SeriesDetail = Series & {
  episodes: Array<{ id: string; seasonNumber: number; episodeNumber: number; movie: Movie }>;
};
function EpisodeEditor({
  episode,
  busy,
  onSave,
  onRemove,
}: {
  episode: SeriesDetail['episodes'][number];
  busy: boolean;
  onSave: (id: string, seasonNumber: number, episodeNumber: number) => void;
  onRemove: (id: string) => void;
}) {
  const [season, setSeason] = React.useState(String(episode.seasonNumber));
  const [number, setNumber] = React.useState(String(episode.episodeNumber));
  React.useEffect(() => {
    setSeason(String(episode.seasonNumber));
    setNumber(String(episode.episodeNumber));
  }, [episode.seasonNumber, episode.episodeNumber]);
  return (
    <li className="rounded-lg border border-border p-3">
      <p className="font-semibold">{episode.movie.title}</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(episode.id, Number(season), Number(number));
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor={`season-${episode.id}`}>Season</Label>
          <Input
            id={`season-${episode.id}`}
            className="w-24"
            type="number"
            min="1"
            max="999"
            required
            value={season}
            onChange={(event) => setSeason(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`episode-${episode.id}`}>Episode</Label>
          <Input
            id={`episode-${episode.id}`}
            className="w-24"
            type="number"
            min="1"
            max="9999"
            required
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={busy}>
          Save position
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'Remove this episode from the series? Its movie and media will be kept.',
              )
            )
              onRemove(episode.id);
          }}
        >
          Remove
        </Button>
      </form>
    </li>
  );
}
export function AdminSeriesView() {
  const client = useQueryClient();
  const [title, setTitle] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [seriesId, setSeriesId] = React.useState('');
  const [seriesSearch, setSeriesSearch] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [movieId, setMovieId] = React.useState('');
  const [seasonNumber, setSeasonNumber] = React.useState('1');
  const [episodeNumber, setEpisodeNumber] = React.useState('1');
  const series = useQuery({
    queryKey: ['admin-series', seriesSearch],
    queryFn: () => apiFetch<{ items: Series[] }>('/series', { query: { q: seriesSearch } }),
  });
  const movies = useQuery({
    queryKey: ['series-movie-picker', search],
    queryFn: () => apiFetch<{ items: Movie[] }>('/admin/movies', { query: { q: search } }),
  });
  const detail = useQuery({
    queryKey: ['series-detail', seriesId],
    queryFn: () => apiFetch<{ series: SeriesDetail }>(`/series/${seriesId}`),
    enabled: !!seriesId,
  });
  const [editTitle, setEditTitle] = React.useState('');
  const [editCountry, setEditCountry] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  React.useEffect(() => {
    if (!detail.data) return;
    setEditTitle(detail.data.series.title);
    setEditCountry(detail.data.series.country);
    setEditDescription(detail.data.series.description);
  }, [detail.data]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['admin-series'] });
    void client.invalidateQueries({ queryKey: ['series'] });
    void client.invalidateQueries({ queryKey: ['series-detail', seriesId] });
  };
  const update = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/series/${seriesId}`, {
        method: 'PATCH',
        body: { title: editTitle, country: editCountry, description: editDescription },
      }),
    onSuccess: () => {
      setSeriesSearch(editTitle);
      refresh();
      toast.success('Series updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeSeries = useMutation({
    mutationFn: () => apiFetch(`/admin/series/${seriesId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      setSeriesId('');
      toast.success('Series removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeEpisode = useMutation({
    mutationFn: (episodeId: string) =>
      apiFetch(`/admin/series/${seriesId}/episodes/${episodeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Episode removed from series');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const updateEpisode = useMutation({
    mutationFn: ({
      id,
      seasonNumber,
      episodeNumber,
    }: {
      id: string;
      seasonNumber: number;
      episodeNumber: number;
    }) =>
      apiFetch(`/admin/series/${seriesId}/episodes/${id}`, {
        method: 'PATCH',
        body: { seasonNumber, episodeNumber },
      }),
    onSuccess: () => {
      refresh();
      toast.success('Episode position updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ series: Series }>('/admin/series', {
        method: 'POST',
        body: { title, country, description },
      }),
    onSuccess: ({ series: added }) => {
      setTitle('');
      setCountry('');
      setDescription('');
      setSeriesSearch(added.title);
      setSeriesId(added.id);
      void client.invalidateQueries({ queryKey: ['admin-series'] });
      void client.invalidateQueries({ queryKey: ['series'] });
      toast.success('Series created');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/series/${seriesId}/episodes`, {
        method: 'POST',
        body: { movieId, seasonNumber: Number(seasonNumber), episodeNumber: Number(episodeNumber) },
      }),
    onSuccess: () => {
      setMovieId('');
      setEpisodeNumber(String(Number(episodeNumber) + 1));
      void client.invalidateQueries({ queryKey: ['series'] });
      void client.invalidateQueries({ queryKey: ['series-detail', seriesId] });
      toast.success('Episode added');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-bold">Series</h1>
      <p className="mt-2 text-muted">
        Create a series and add existing movie entries as episodes. Each episode needs approved
        media and a verified license to play.
      </p>
      <form
        className="mt-8 grid gap-4 rounded-2xl border border-border bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="font-display text-xl font-semibold">Create a series</h2>
        <div className="grid gap-2">
          <Label htmlFor="series-title">Title</Label>
          <Input
            id="series-title"
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="series-country">Country</Label>
          <Input
            id="series-country"
            maxLength={80}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="series-description">Description</Label>
          <textarea
            id="series-description"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-24 rounded-lg border border-border bg-background p-3 text-sm"
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Create series
        </Button>
      </form>
      <form
        className="mt-6 grid gap-4 rounded-2xl border border-border bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <h2 className="font-display text-xl font-semibold">Add an episode</h2>
        {series.isError && <p role="alert">Couldn’t load series.</p>}
        <div className="grid gap-2">
          <Label htmlFor="series-search">Search series</Label>
          <Input
            id="series-search"
            value={seriesSearch}
            onChange={(e) => {
              setSeriesSearch(e.target.value);
              setSeriesId('');
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="series-select">Series</Label>
          <select
            id="series-select"
            required
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3"
          >
            <option value="">Choose a series</option>
            {series.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="movie-search">Search existing movies</Label>
          <Input
            id="movie-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setMovieId('');
            }}
          />
        </div>
        {movies.isError && <p role="alert">Couldn’t load movies.</p>}
        <div className="grid gap-2">
          <Label htmlFor="movie-select">Movie entry</Label>
          <select
            id="movie-select"
            required
            value={movieId}
            onChange={(e) => setMovieId(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3"
          >
            <option value="">Choose a movie</option>
            {movies.data?.items.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="season">Season</Label>
            <Input
              id="season"
              type="number"
              min="1"
              max="999"
              required
              value={seasonNumber}
              onChange={(e) => setSeasonNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="episode">Episode</Label>
            <Input
              id="episode"
              type="number"
              min="1"
              max="9999"
              required
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={add.isPending}>
          Add episode
        </Button>
      </form>
      {seriesId && detail.data && (
        <div className="mt-6 grid gap-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Manage selected series</h2>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="edit-series-title">Title</Label>
              <Input
                id="edit-series-title"
                required
                maxLength={160}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-series-country">Country</Label>
              <Input
                id="edit-series-country"
                maxLength={80}
                value={editCountry}
                onChange={(e) => setEditCountry(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-series-description">Description</Label>
              <textarea
                id="edit-series-description"
                maxLength={2000}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="min-h-24 rounded-lg border border-border bg-background p-3 text-sm"
              />
            </div>
            <Button type="submit" disabled={update.isPending}>
              Save series
            </Button>
          </form>
          <h3 className="font-semibold">Episodes</h3>
          {detail.data.series.episodes.length === 0 ? (
            <p className="text-sm text-muted">No episodes added yet.</p>
          ) : (
            <ul className="grid gap-2">
              {detail.data.series.episodes.map((episode) => (
                <EpisodeEditor
                  key={episode.id}
                  episode={episode}
                  busy={removeEpisode.isPending || updateEpisode.isPending}
                  onSave={(id, seasonNumber, episodeNumber) =>
                    updateEpisode.mutate({ id, seasonNumber, episodeNumber })
                  }
                  onRemove={(id) => removeEpisode.mutate(id)}
                />
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={removeSeries.isPending}
            onClick={() => {
              if (window.confirm('Delete this series? Its movie and media entries will be kept.'))
                removeSeries.mutate();
            }}
          >
            Delete series
          </Button>
        </div>
      )}
      <TvMediaLink />
    </div>
  );
}
