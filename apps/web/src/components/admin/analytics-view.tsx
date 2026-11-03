'use client';

import { Film } from 'lucide-react';
import Link from 'next/link';
import { useUrlState } from '@/components/browse/use-url-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminAnalytics, type AdminAnalytics, type AnalyticsSeries } from '@/lib/queries/admin';
import { formatCount, formatDay } from './admin-utils';
import {
  AdminPageHeader,
  AdminQueryError,
  Segmented,
  SortableTh,
  TableFrame,
  Th,
  tdClass,
  trClass,
  useSorted,
} from './admin-ui';
import { TimeSeriesChart } from './time-series-chart';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
] as const;
type Range = (typeof RANGES)[number]['value'];

const SERIES: Array<{ key: AnalyticsSeries; title: string; noun: string }> = [
  { key: 'signups', title: 'New accounts', noun: 'signups' },
  { key: 'roomsCreated', title: 'Rooms created', noun: 'rooms' },
  { key: 'messages', title: 'Chat messages', noun: 'messages' },
  { key: 'watchHistoryUpdates', title: 'Watch activity', noun: 'titles watched' },
];

function TopMovies({ data }: { data: AdminAnalytics }) {
  const { sorted, sort, setSort } = useSorted(
    data.topMovies,
    { title: (m) => m.title, viewers: (m) => m.viewers },
    { key: 'viewers', dir: 'desc' },
  );
  const max = Math.max(1, ...data.topMovies.map((m) => m.viewers));
  if (!data.topMovies.length) {
    return (
      <EmptyState
        icon={Film}
        title="Nobody watched anything in this period"
        description="Titles appear here once signed-in viewers start watching."
      />
    );
  }
  const rank = new Map(
    [...data.topMovies].sort((a, b) => b.viewers - a.viewers).map((m, i) => [m.movieId, i + 1]),
  );
  return (
    <TableFrame
      caption={`Top movies by distinct viewers, ${formatDay(data.from, true)} – ${formatDay(data.to, true)}`}
      captionVisible
      minWidth={480}
    >
      <thead>
        <tr>
          <Th className="w-12">#</Th>
          <SortableTh label="Title" sortKey="title" sort={sort} onSort={setSort} />
          <SortableTh
            label="Viewers"
            sortKey="viewers"
            sort={sort}
            onSort={setSort}
            className="w-[45%]"
          />
        </tr>
      </thead>
      <tbody>
        {sorted.map((m) => (
          <tr key={m.movieId} className={trClass}>
            <td className={`${tdClass} tabular-nums text-muted`}>{rank.get(m.movieId)}</td>
            <th scope="row" className={`${tdClass} font-medium`}>
              <Link href={`/movies/${m.movieId}`} className="rounded-sm hover:underline focus-ring">
                {m.title}
              </Link>
            </th>
            <td className={tdClass}>
              <span className="flex items-center gap-3">
                <span
                  className="h-2 flex-1 overflow-hidden rounded-full bg-primary/10"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(m.viewers / max) * 100}%` }}
                  />
                </span>
                <span className="w-10 text-right tabular-nums">{formatCount(m.viewers)}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

export function AnalyticsView() {
  const { params, set } = useUrlState();
  const raw = Number(params.get('days'));
  const days: Range = RANGES.some((r) => r.value === raw) ? (raw as Range) : 30;
  const query = useAdminAnalytics(days);
  const data = query.data;
  const stale = query.isFetching && query.isPlaceholderData;

  return (
    <div>
      <AdminPageHeader
        title="Analytics"
        description="Daily activity in UTC, zero-filled, ending today."
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Segmented
          label="Date range"
          value={days}
          options={RANGES}
          onChange={(v) => set({ days: v === 30 ? null : v })}
        />
        {data ? (
          <p className="text-sm text-muted">
            {formatDay(data.from, true)} – {formatDay(data.to, true)}
          </p>
        ) : null}
      </div>

      {query.isLoading ? (
        <div
          role="status"
          aria-label="Loading analytics"
          className="mt-6 grid gap-4 xl:grid-cols-2"
        >
          {SERIES.map((s) => (
            <Skeleton key={s.key} className="h-[290px] rounded-2xl" />
          ))}
        </div>
      ) : query.isError || !data ? (
        <div className="mt-6">
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Analytics didn’t load"
          />
        </div>
      ) : (
        <div
          className="mt-6 grid grid-cols-1 gap-6 transition-opacity"
          style={{ opacity: stale ? 0.55 : 1 }}
          aria-busy={stale || undefined}
        >
          <section aria-label="Daily activity" className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {SERIES.map((s) => (
              <TimeSeriesChart
                key={s.key}
                id={`chart-${s.key}`}
                title={s.title}
                noun={s.noun}
                points={data.series[s.key]}
              />
            ))}
          </section>
          <section aria-label="Top movies">
            <TopMovies data={data} />
          </section>
        </div>
      )}
    </div>
  );
}
