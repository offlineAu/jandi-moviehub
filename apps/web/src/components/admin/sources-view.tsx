'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { apiFetch, errorMessage } from '@/lib/api';

type Candidate = {
  id: number;
  title: string;
  sourceUrl: string;
  mime: string;
  sizeBytes: number | null;
  license: string;
  artist: string;
  licenseUrl: string;
};
export function SourcesView() {
  const client = useQueryClient();
  const [text, setText] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);
  const queue = useQuery({
    queryKey: ['source-candidate-queue', page],
    queryFn: () =>
      apiFetch<{
        items: Array<{
          id: string;
          title: string;
          sourceUrl: string;
          artist: string;
          license: string;
        }>;
        totalPages: number;
      }>('/admin/source-candidates', { query: { page } }),
  });
  const save = useMutation({
    mutationFn: (pageId: number) =>
      apiFetch<{ created: boolean }>('/admin/source-candidates/commons', {
        method: 'POST',
        body: { pageId },
      }),
    onSuccess: (response) => {
      void client.invalidateQueries({ queryKey: ['source-candidate-queue'] });
      toast.success(response.created ? 'Saved for review' : 'Already saved for review');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/source-candidates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setPage(1);
      void client.invalidateQueries({ queryKey: ['source-candidate-queue'] });
      toast.success('Removed from review');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const result = useQuery({
    queryKey: ['commons-candidates', query],
    queryFn: () =>
      apiFetch<{ items: Candidate[] }>('/admin/source-candidates/commons', { query: { q: query } }),
    enabled: query.length >= 2,
    retry: false,
  });
  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-3xl font-bold">Find source videos</h1>
      <p className="mt-2 text-muted">
        Search Wikimedia Commons for possible videos. Results are candidates only: check the exact
        file, creator, license, territory and attribution before adding any media to Jandi.
      </p>
      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(text.trim());
        }}
      >
        <div className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor="source-search">Search Wikimedia Commons</Label>
          <Input
            id="source-search"
            minLength={2}
            maxLength={100}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <div className="mt-7" aria-live="polite">
        {result.isFetching ? (
          <p>Searching…</p>
        ) : result.isError ? (
          <ErrorState error={result.error} onRetry={() => void result.refetch()} />
        ) : result.data ? (
          result.data.items.length ? (
            <ul className="grid gap-3">
              {result.data.items.map((item) => (
                <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm text-muted">
                    {item.artist || 'Creator not provided'} ·{' '}
                    {item.license || 'License not provided'} · {item.mime}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Unverified candidate · Not playable in Jandi
                  </p>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm link-fx"
                  >
                    Review source and license (opens in new tab)
                  </a>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={save.isPending}
                      onClick={() => save.mutate(item.id)}
                    >
                      Save for review
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No video candidates found. Try another search.</p>
          )
        ) : (
          <p className="text-muted">Search to review possible sources.</p>
        )}
      </div>
      <section className="mt-10" aria-labelledby="saved-sources-heading">
        <h2 id="saved-sources-heading" className="font-display text-xl font-semibold">
          Saved for review
        </h2>
        <p className="mt-2 text-sm text-muted">
          Saved candidates remain unverified and cannot be played until a separate license and media
          asset are approved.
        </p>
        <p className="mt-2 text-sm text-muted">
          After reviewing the source, add its{' '}
          <Link className="link-fx" href="/admin/movies">
            movie entry
          </Link>{' '}
          and{' '}
          <Link className="link-fx" href="/admin/licenses">
            license
          </Link>
          , then upload and approve the file in{' '}
          <Link className="link-fx" href="/admin/media">
            media assets
          </Link>
          .
        </p>
        {queue.isLoading ? (
          <p className="mt-4 text-muted">Loading saved candidates…</p>
        ) : queue.isError ? (
          <ErrorState className="mt-4" error={queue.error} onRetry={() => void queue.refetch()} />
        ) : !queue.data?.items.length ? (
          <p className="mt-4 text-muted">No saved candidates yet.</p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3">
              {queue.data.items.map((item) => (
                <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {item.artist || 'Creator not provided'} ·{' '}
                    {item.license || 'License not provided'}
                  </p>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm link-fx"
                  >
                    Review source and license (opens in new tab)
                  </a>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm('Remove this candidate from the review list?'))
                          remove.mutate(item.id);
                      }}
                    >
                      Remove from review
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted">
                Page {page} of {queue.data.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= queue.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
