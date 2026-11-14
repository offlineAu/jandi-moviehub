'use client';

import { Film, Lock, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { Artwork } from '@/components/movies/artwork';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { Tooltip } from '@/components/ui/tooltip';
import {
  ADMIN_PAGE_SIZE,
  useAdminMovies,
  useDeleteAdminMovie,
  type AdminMovie,
} from '@/lib/queries/admin';
import { formatRelative, formatRuntime } from '@/lib/utils';
import { ActionDialog } from './action-dialog';
import { adminErrorMessage } from './admin-utils';
import {
  AdminPageHeader,
  AdminQueryError,
  FilterSelect,
  ResultSummary,
  SortableTh,
  TableFrame,
  TableSkeleton,
  Th,
  Toolbar,
  enumParam,
  tdClass,
  trClass,
  usePageParam,
  useSorted,
  useUrlSearch,
} from './admin-ui';
import { MovieFormDialog } from './movie-form-dialog';

const SOURCES = ['LOCAL', 'TMDB'] as const;

function DeleteMovieDialog({ movie, onClose }: { movie: AdminMovie; onClose: () => void }) {
  const remove = useDeleteAdminMovie();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <ActionDialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      destructive
      title={`Delete “${movie.title}”?`}
      description={
        <>
          This permanently removes the title
          {movie.assetCount
            ? ` and its ${movie.assetCount} media asset${movie.assetCount === 1 ? '' : 's'}`
            : ''}
          , along with everyone’s favorites, watchlist entries and watch history for it. This can’t
          be undone.
        </>
      }
      confirmLabel="Delete movie"
      pendingLabel="Deleting"
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        remove.mutate(movie.id, {
          onSuccess: () => {
            toast.success(`Deleted “${movie.title}”`);
            onClose();
          },
          onError: (e) => setError(adminErrorMessage(e)),
        });
      }}
    />
  );
}

export function MoviesView() {
  const { params, set } = useUrlState();
  const { q, text, setText } = useUrlSearch();
  const { page, setPage } = usePageParam();
  const source = enumParam(params.get('source'), SOURCES);
  const query = useAdminMovies({ q: q || undefined, source: source || undefined, page });
  const [editing, setEditing] = React.useState<AdminMovie | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminMovie | null>(null);
  const { sorted, sort, setSort } = useSorted(query.data?.items, {
    title: (m) => m.title,
    release: (m) => m.releaseDate,
    assets: (m) => m.assetCount,
    updated: (m) => Date.parse(m.updatedAt),
  });

  return (
    <div>
      <AdminPageHeader
        title="Movies"
        description="Catalog metadata. A title is playable only with an approved media asset whose license is verified and in its validity window."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            New movie
          </Button>
        }
      />
      <Toolbar>
        <SearchInput
          label="Search movies by title"
          placeholder="Search titles"
          value={text}
          onValueChange={setText}
          className="sm:w-80"
        />
        <FilterSelect
          id="filter-source"
          label="Source"
          value={source}
          onValueChange={(v) => set({ source: v || null })}
          options={[
            { value: 'LOCAL', label: 'Local (editable)' },
            { value: 'TMDB', label: 'TMDB (read-only)' },
          ]}
          allLabel="All sources"
        />
      </Toolbar>

      <div className="mt-5 grid grid-cols-1 gap-4">
        {query.data ? (
          <ResultSummary
            total={query.data.total}
            page={query.data.page}
            pageSize={ADMIN_PAGE_SIZE}
            noun="movies"
          />
        ) : null}
        {query.isLoading ? (
          <TableSkeleton label="Loading movies" />
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Movies didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState
            icon={Film}
            title={q || source ? 'No movies match these filters' : 'The catalog is empty'}
            description={
              q || source
                ? 'Try a different search or source.'
                : 'Add the first title to get started.'
            }
            action={
              q || source ? null : (
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" />
                  New movie
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableFrame
              caption={`Movies, page ${query.data.page} of ${query.data.totalPages}`}
              busy={query.isFetching && query.isPlaceholderData}
              minWidth={900}
            >
              <thead>
                <tr>
                  <SortableTh label="Title" sortKey="title" sort={sort} onSort={setSort} />
                  <Th>Source</Th>
                  <Th>Genres</Th>
                  <SortableTh label="Released" sortKey="release" sort={sort} onSort={setSort} />
                  <SortableTh label="Assets" sortKey="assets" sort={sort} onSort={setSort} />
                  <Th>Playback</Th>
                  <SortableTh label="Updated" sortKey="updated" sort={sort} onSort={setSort} />
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.id} className={trClass}>
                    <th scope="row" className={`${tdClass} max-w-72 font-normal`}>
                      <span className="flex items-center gap-3">
                        <span className="relative aspect-[2/3] w-9 shrink-0 overflow-hidden rounded-md bg-secondary">
                          <Artwork src={m.posterUrl} alt="" sizes="36px" />
                        </span>
                        <span className="min-w-0">
                          <Link
                            href={`/movies/${m.id}`}
                            className="block truncate rounded-sm font-medium text-foreground hover:underline focus-ring"
                          >
                            {m.title}
                          </Link>
                          <span className="block text-xs text-muted">
                            {formatRuntime(m.runtimeMin) ?? 'Runtime unknown'}
                          </span>
                        </span>
                      </span>
                    </th>
                    <td className={tdClass}>
                      <span className="flex flex-wrap gap-1">
                        {m.source === 'TMDB' ? (
                          <Badge variant="outline">
                            <Lock aria-hidden="true" />
                            TMDB
                          </Badge>
                        ) : (
                          <Badge variant="neutral">Local</Badge>
                        )}
                        {m.isDemo ? <Badge variant="demo">Demo</Badge> : null}
                      </span>
                    </td>
                    <td className={`${tdClass} max-w-48 text-muted`}>
                      <span className="line-clamp-2">{m.genres.join(', ') || '—'}</span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>
                      {m.releaseDate ?? '—'}
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      <Link
                        href={`/admin/media?movieId=${m.id}`}
                        className="rounded-sm hover:underline focus-ring"
                        aria-label={`${m.assetCount} media assets for ${m.title}`}
                      >
                        {m.assetCount}
                      </Link>
                    </td>
                    <td className={tdClass}>
                      {m.playable ? (
                        <Badge variant="playable">
                          <Play className="fill-current" aria-hidden="true" />
                          Playable
                        </Badge>
                      ) : (
                        <span className="text-muted">Not playable</span>
                      )}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted`}>
                      {formatRelative(m.updatedAt)}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <span className="inline-flex items-center gap-1">
                        {m.source === 'TMDB' ? (
                          <Tooltip label="Synced from TMDB — read-only">
                            <span
                              role="img"
                              tabIndex={0}
                              className="grid size-8 place-items-center rounded-full text-subtle focus-ring"
                              aria-label={`${m.title} is managed by TMDB and can’t be edited`}
                            >
                              <Lock className="size-4" aria-hidden="true" />
                            </span>
                          </Tooltip>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(m)}
                            aria-label={`Edit ${m.title}`}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(m)}
                          aria-label={`Delete ${m.title}`}
                          className="text-danger hover:text-danger"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <Pagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <MovieFormDialog open={creating} onOpenChange={setCreating} />
      <MovieFormDialog
        open={!!editing}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
        movie={editing ?? undefined}
      />
      {deleting ? (
        <DeleteMovieDialog key={deleting.id} movie={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </div>
  );
}
