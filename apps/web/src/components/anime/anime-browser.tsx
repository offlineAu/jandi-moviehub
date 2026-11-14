'use client';
import * as React from 'react';
import Link from 'next/link';
import { selectionTitle } from '@jandi/shared';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { useAnime, useAnimeEpisodes } from '@/lib/queries/anime';
import { errorMessage } from '@/lib/api';

export function AnimePicker({ q, onSelect }: { q: string; onSelect: (value: string) => void }) {
  const results = useAnime(q, 1, q.length >= 2);
  const [selected, setSelected] = React.useState('');
  const episodes = useAnimeEpisodes(selected);
  if (selected)
    return (
      <div className="space-y-3 py-4">
        <Button variant="ghost" onClick={() => setSelected('')}>
          Back to anime results
        </Button>
        <h3>{episodes.data?.title.title ?? 'Loading episodes…'}</h3>
        {episodes.isError && <p role="alert">{errorMessage(episodes.error)}</p>}
        <div className="grid max-h-72 gap-2 overflow-auto">
          {episodes.data?.episodes.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2">
              <span>{e.label}</span>
              {e.sources.length ? (
                e.sources.map((s) => (
                  <Button
                    key={s.id}
                    variant="secondary"
                    onClick={() =>
                      onSelect(selectionTitle({ provider: 'anime', type: 'anime', sourceId: s.id }))
                    }
                  >
                    {s.audioLanguage} · {s.subtitleLanguage ?? 'Subtitles unconfirmed'} ·{' '}
                    {s.adapterId}
                  </Button>
                ))
              ) : (
                <span className="text-sm text-muted">No verified source yet</span>
              )}
            </div>
          ))}
          {episodes.data?.episodes.length === 0 && <p>Episodes have not been mapped yet.</p>}
        </div>
      </div>
    );
  if (q.length < 2 || !results.data?.items.length) return null;
  return (
    <section className="mt-4 border-t border-border pt-4">
      <h3>Anime</h3>
      <div className="grid max-h-64 gap-2 overflow-auto">
        {results.data.items.map((a) => (
          <Button
            key={a.id}
            variant="ghost"
            className="justify-start whitespace-normal text-left"
            onClick={() => setSelected(a.id)}
          >
            {a.title}
          </Button>
        ))}
      </div>
    </section>
  );
}
export function AnimeBrowser() {
  const [text, setText] = React.useState('');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);
  const result = useAnime(q, page);
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-semibold">Anime</h1>
      <p className="text-muted">Find a series, choose an episode, and watch solo or together.</p>
      <SearchInput
        label="Search anime"
        placeholder="Search anime titles"
        value={text}
        onValueChange={setText}
      />
      {result.isPending && <p role="status">Loading anime…</p>}
      {result.isError && <p role="alert">{errorMessage(result.error)}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.data?.items.map((a) => (
          <Link
            className="rounded-xl border border-border bg-secondary p-5 focus-ring"
            key={a.id}
            href={`/anime/${a.id}`}
          >
            <h2 className="font-medium">{a.title}</h2>
            <p className="text-sm text-muted">{a.format} · View episodes</p>
          </Link>
        ))}
      </div>
      {result.data?.items.length === 0 && <p>No anime found.</p>}
      <div className="flex gap-3">
        <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Button disabled={!result.data?.hasMore} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
      <p className="text-xs text-muted">
        Catalog: Anime Offline Database (ODbL-1.0). A catalog listing does not confirm stream
        availability.
      </p>
    </main>
  );
}
