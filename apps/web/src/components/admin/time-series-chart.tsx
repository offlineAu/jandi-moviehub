'use client';

import { Table2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { DailyPoint } from '@/lib/queries/admin';
import { cn } from '@/lib/utils';
import { countTicks, formatCount, formatDay } from './admin-utils';

const HEIGHT = 200;
const M = { top: 14, right: 44, bottom: 28, left: 40 };
/** Chart surface (bg-surface/60 over the page background) — used for the marker ring. */
const SURFACE = '#12121e';

/** Tracks an element's width; a callback ref so it re-attaches when the element remounts. */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = React.useState<T | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, width };
}

/** Evenly spaced x-axis label indices that fit the available width. */
function xLabelIndices(n: number, innerWidth: number): number[] {
  if (n <= 1) return [0];
  const fit = Math.max(2, Math.floor(innerWidth / 64));
  const count = Math.min(n, fit, 7);
  const out = new Set<number>();
  for (let i = 0; i < count; i++) out.add(Math.round((i * (n - 1)) / (count - 1)));
  return [...out];
}

/**
 * Daily counts as a 2px line over a 10% area wash, with a snapping crosshair + tooltip
 * (pointer and arrow keys) and a data table that is always available to screen readers.
 */
export function TimeSeriesChart({
  id,
  title,
  noun,
  points,
}: {
  id: string;
  title: string;
  /** Plural noun used in summaries and the tooltip, e.g. "signups". */
  noun: string;
  points: DailyPoint[];
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = React.useState<number | null>(null);
  const [showTable, setShowTable] = React.useState(false);

  const n = points.length;
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const peak = points.reduce<DailyPoint | null>(
    (best, p) => (!best || p.count > best.count ? p : best),
    null,
  );
  const ticks = countTicks(peak?.count ?? 0);
  const yMax = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (i: number) => M.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => M.top + innerH - (v / yMax) * innerH;

  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`)
    .join('');
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';
  const last = n ? points[n - 1]! : null;
  const activePoint = active != null ? points[active] : null;

  const onPointer = (event: React.PointerEvent<SVGRectElement>) => {
    if (!n) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!n) return;
    const current = active ?? n - 1;
    let next = current;
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'ArrowRight') next = Math.min(n - 1, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else if (event.key === 'Escape') {
      setActive(null);
      return;
    } else return;
    event.preventDefault();
    setActive(next);
  };

  const summary =
    total === 0
      ? `No ${noun} in this period.`
      : `${formatCount(total)} ${noun} in total; peak ${formatCount(peak!.count)} on ${formatDay(peak!.date)}.`;
  const tableId = `${id}-table`;

  return (
    <figure
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface/60 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="font-display text-base font-semibold">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{summary}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((v) => !v)}
          className="shrink-0 text-muted"
        >
          <Table2 aria-hidden="true" />
          {showTable ? 'Chart' : 'Table'}
        </Button>
      </div>

      {showTable ? null : (
        <div
          ref={ref}
          className="relative mt-3 rounded-lg focus-ring"
          tabIndex={0}
          role="group"
          aria-label={`${title} chart. ${summary} Use the left and right arrow keys to read each day.`}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => a ?? n - 1)}
          onBlur={() => setActive(null)}
        >
          {width > 0 ? (
            <svg
              width={width}
              height={HEIGHT}
              aria-hidden="true"
              className="block overflow-visible"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={M.left}
                    x2={width - M.right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke="rgb(255 255 255 / 0.07)"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={M.left - 8}
                    y={y(t)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-subtle text-[11px] tabular-nums"
                  >
                    {formatCount(t)}
                  </text>
                </g>
              ))}
              {xLabelIndices(n, innerW).map((i) => (
                <text
                  key={i}
                  x={x(i)}
                  y={HEIGHT - 8}
                  textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}
                  className="fill-subtle text-[11px] tabular-nums"
                >
                  {formatDay(points[i]!.date)}
                </text>
              ))}
              <path d={area} fill="var(--primary)" fillOpacity={0.1} />
              <path
                d={line}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {last ? (
                <>
                  <circle
                    cx={x(n - 1)}
                    cy={y(last.count)}
                    r={4}
                    fill="var(--primary)"
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                  <text
                    x={x(n - 1) + 8}
                    y={y(last.count)}
                    dy="0.32em"
                    className="fill-foreground text-[11px] font-medium tabular-nums"
                  >
                    {formatCount(last.count)}
                  </text>
                </>
              ) : null}
              {activePoint && active != null ? (
                <g>
                  <line
                    x1={x(active)}
                    x2={x(active)}
                    y1={M.top}
                    y2={M.top + innerH}
                    stroke="rgb(255 255 255 / 0.28)"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <circle
                    cx={x(active)}
                    cy={y(activePoint.count)}
                    r={5}
                    fill="var(--primary)"
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                </g>
              ) : null}
              <rect
                x={M.left}
                y={M.top}
                width={innerW}
                height={innerH}
                fill="transparent"
                onPointerMove={onPointer}
                onPointerDown={onPointer}
                onPointerLeave={() => setActive(null)}
              />
            </svg>
          ) : (
            <div style={{ height: HEIGHT }} />
          )}
          {activePoint && active != null ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 z-10 min-w-28 -translate-x-1/2 rounded-lg border border-border-strong bg-[#0f0f1a] px-3 py-2 shadow-xl"
              style={{
                left: Math.min(Math.max(x(active), 64), Math.max(64, width - 64)),
              }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                <span className="h-0.5 w-3 rounded-full bg-primary" aria-hidden="true" />
                {formatCount(activePoint.count)}
              </p>
              <p className="text-xs text-muted">{formatDay(activePoint.date, true)}</p>
            </div>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {activePoint
              ? `${formatDay(activePoint.date, true)}: ${activePoint.count} ${noun}`
              : ''}
          </p>
        </div>
      )}

      <div
        id={tableId}
        className={cn(showTable ? 'mt-3 max-h-[232px] overflow-y-auto rounded-lg' : 'sr-only')}
      >
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{`${title}, daily counts (UTC)`}</caption>
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th
                scope="col"
                className="border-b border-border px-3 py-2 text-xs font-medium text-muted"
              >
                Day (UTC)
              </th>
              <th
                scope="col"
                className="border-b border-border px-3 py-2 text-right text-xs font-medium text-muted"
              >
                {noun.charAt(0).toUpperCase() + noun.slice(1)}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <th
                  scope="row"
                  className="border-b border-border/60 px-3 py-1.5 font-normal text-muted"
                >
                  {formatDay(p.date, true)}
                </th>
                <td className="border-b border-border/60 px-3 py-1.5 text-right tabular-nums">
                  {p.count.toLocaleString('en')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
