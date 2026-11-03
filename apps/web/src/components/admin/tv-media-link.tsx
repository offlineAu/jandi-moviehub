'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, errorMessage } from '@/lib/api';

export function TvMediaLink() {
  const [id, setId] = React.useState('');
  const [season, setSeason] = React.useState('1');
  const [episode, setEpisode] = React.useState('1');
  const [search, setSearch] = React.useState('');
  const [movieId, setMovieId] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);
  const movies = useQuery({
    queryKey: ['tv-link-movies', search],
    queryFn: () =>
      apiFetch<{ items: { id: string; title: string }[] }>('/admin/movies', {
        query: { q: search },
      }),
  });
  const path = `/admin/tv/${encodeURIComponent(id)}/seasons/${encodeURIComponent(season)}/episodes/${encodeURIComponent(episode)}/media`;
  const link = useMutation({
    mutationFn: () => apiFetch(path, { method: 'PUT', body: { movieId, confirmed: true } }),
    onSuccess: () => {
      setConfirmed(false);
      toast.success('Episode media linked');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unlink = useMutation({
    mutationFn: () => apiFetch(path, { method: 'DELETE' }),
    onSuccess: () => toast.success('Episode media unlinked'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-display text-xl font-semibold">
        Link authorized media to a TMDB episode
      </h2>
      <p className="mt-2 text-sm text-muted">
        Choose the exact episode and a media record containing that episode. The file must have an
        approved asset and a valid verified license. Linking metadata does not grant rights.
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          link.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="tv-link-id">TMDB TV ID</Label>
            <Input
              id="tv-link-id"
              type="number"
              min="1"
              max="2147483647"
              required
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="tv-link-season">Season</Label>
            <Input
              id="tv-link-season"
              type="number"
              min="0"
              max="9999"
              required
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="tv-link-episode">Episode</Label>
            <Input
              id="tv-link-episode"
              type="number"
              min="0"
              max="9999"
              required
              value={episode}
              onChange={(e) => setEpisode(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="tv-link-search">Search media titles</Label>
          <Input
            id="tv-link-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setMovieId('');
            }}
          />
        </div>
        <label className="grid gap-2 text-sm" htmlFor="tv-link-movie">
          Media title
          <select
            id="tv-link-movie"
            required
            value={movieId}
            onChange={(e) => setMovieId(e.target.value)}
            className="rounded-lg border border-border bg-background p-3"
          >
            <option value="">Select a title</option>
            {movies.data?.items.map((movie) => (
              <option key={movie.id} value={movie.id}>
                {movie.title}
              </option>
            ))}
          </select>
        </label>
        {movies.isError && <p className="text-sm text-danger">Media titles could not be loaded.</p>}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{' '}
          I verified that this file is the exact episode and we have rights to stream it.
        </label>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!confirmed || !movieId || link.isPending}>
            Link approved media
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!id || unlink.isPending}
            onClick={() => {
              if (window.confirm('Unlink this episode? The media file will be kept.'))
                unlink.mutate();
            }}
          >
            Unlink episode media
          </Button>
        </div>
      </form>
    </section>
  );
}
