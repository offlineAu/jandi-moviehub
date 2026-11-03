'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, ShieldX } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useUrlState } from '@/components/browse/use-url-state';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';
import type { PublicUser } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ───────────────────────── Page chrome ───────────────────────── */

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** One left-aligned row of filters above the content they scope. */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Filters"
      className={cn('mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end', className)}
    >
      {children}
    </div>
  );
}

const ALL = '__all__';

/** Labelled Radix select with an "All" option (Radix items can't use an empty value). */
export function FilterSelect<T extends string>({
  id,
  label,
  value,
  onValueChange,
  options,
  allLabel = 'All',
  className,
}: {
  id: string;
  label: string;
  value: T | '';
  onValueChange: (value: T | '') => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  allLabel?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-muted">
        {label}
      </Label>
      <Select
        value={value || (allLabel === null ? undefined : ALL)}
        onValueChange={(v) => onValueChange(v === ALL ? '' : (v as T))}
      >
        <SelectTrigger id={id} className="h-10 sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel !== null ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Text search bound to `?q=` with a 300 ms debounce. */
export function useUrlSearch(key = 'q', max = 80) {
  const { params, set } = useUrlState();
  const q = (params.get(key) ?? '').slice(0, max);
  const [text, setText] = React.useState(q);
  React.useEffect(() => setText(q), [q]);
  React.useEffect(() => {
    if (text.trim() === q) return;
    const t = window.setTimeout(() => set({ [key]: text.trim() || null }), 300);
    return () => window.clearTimeout(t);
  }, [text, q, key, set]);
  return { q, text, setText };
}

export function usePageParam() {
  const { params, set } = useUrlState();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const setPage = React.useCallback(
    (p: number) => {
      set({ page: p > 1 ? p : null });
      document.getElementById('main')?.scrollIntoView({ block: 'start' });
    },
    [set],
  );
  return { page, setPage };
}

export function enumParam<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

export function ResultSummary({
  total,
  page,
  pageSize,
  noun,
}: {
  total: number;
  page: number;
  pageSize: number;
  noun: string;
}) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <p className="text-sm text-muted" aria-live="polite">
      Showing <span className="tabular-nums text-foreground">{from}</span>–
      <span className="tabular-nums text-foreground">{to}</span> of{' '}
      <span className="tabular-nums text-foreground">{total.toLocaleString('en')}</span> {noun}
    </p>
  );
}

/* ───────────────────────── States ───────────────────────── */

export function isForbidden(error: unknown) {
  return isApiError(error) && error.status === 403;
}

export function ForbiddenState({
  title = 'You don’t have access to this section',
  description = 'Your account role doesn’t allow this. If you think it should, ask an administrator.',
  action,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-warning/25 bg-warning/[0.04] px-6 py-14 text-center',
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-warning/10 text-warning ring-1 ring-warning/25">
        <ShieldX className="size-5" aria-hidden="true" />
      </span>
      <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
        403 · Forbidden
      </p>
      <div className="grid max-w-md gap-1.5">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Error UI for admin queries: a 403 becomes the forbidden screen, anything else retries. */
export function AdminQueryError({
  error,
  onRetry,
  retrying,
  title,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  title?: string;
}) {
  if (isForbidden(error)) {
    return (
      <ForbiddenState
        description="The server refused this request for your account. Your role may have changed — reload to refresh your permissions."
        action={
          <Button variant="secondary" asChild>
            <Link href="/">Back to Jandi</Link>
          </Button>
        }
      />
    );
  }
  return <ErrorState title={title} error={error} onRetry={onRetry} retrying={retrying} />;
}

/* ───────────────────────── Tables ───────────────────────── */

export function TableFrame({
  caption,
  captionVisible = false,
  busy,
  children,
  minWidth = 720,
}: {
  caption: string;
  captionVisible?: boolean;
  busy?: boolean;
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn(
        'relative overflow-x-auto rounded-2xl border border-border bg-surface/50 focus-ring transition-opacity',
        busy && 'opacity-60',
      )}
      aria-busy={busy || undefined}
    >
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        <caption
          className={cn(
            captionVisible
              ? 'px-4 pb-1 pt-4 text-left font-display text-base font-semibold'
              : 'sr-only',
          )}
        >
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-border px-4 py-3 text-xs font-medium text-muted',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = 'left',
}: {
  label: string;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (next: SortState<K>) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(
        'whitespace-nowrap border-b border-border px-2 py-1.5 text-xs font-medium text-muted',
        align === 'right' && 'text-right',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-white/[0.05] hover:text-foreground focus-ring',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden="true" />
      </button>
    </th>
  );
}

export function useSorted<T, K extends string>(
  items: T[] | undefined,
  accessors: Record<K, (item: T) => string | number | null>,
  initial: NoInfer<SortState<K>> | null = null,
) {
  const [sort, setSort] = React.useState<SortState<K> | null>(initial);
  const sorted = React.useMemo(() => {
    if (!items || !sort) return items ?? [];
    const get = accessors[sort.key];
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'en', { sensitivity: 'base' }) * factor;
    });
    // accessors are static per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort]);
  return { sorted, sort, setSort };
}

export const tdClass = 'border-b border-border/70 px-4 py-3 align-middle';
export const trClass = 'transition-colors hover:bg-white/[0.02] [&:last-child>td]:border-b-0';

export function TableSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-surface/50"
      aria-busy="true"
      role="status"
      aria-label={label}
    >
      <div className="flex gap-4 border-b border-border px-4 py-3.5">
        {[24, 16, 12, 20].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border/70 px-4 py-3.5 last:border-b-0"
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 w-1/6" />
          <Skeleton className="ml-auto h-7 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Cells ───────────────────────── */

export function UserCell({
  user,
  sub,
  size = 'sm',
}: {
  user: PublicUser | null;
  sub?: React.ReactNode;
  size?: 'xs' | 'sm';
}) {
  if (!user) return <span className="text-subtle">Deleted user</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar src={user.avatarUrl} name={user.displayName} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{user.displayName}</span>
        <span className="block truncate text-xs text-muted">
          {user.isGuest ? 'Guest' : `@${user.username}`}
          {sub ? <> · {sub}</> : null}
        </span>
      </span>
    </span>
  );
}

/** Small key/value pair used inside cards. */
export function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  );
}

/** Segmented single-choice control (radio group semantics). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const index = options.findIndex((o) => o.value === value);
  const move = (delta: number) => {
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-border-strong bg-secondary p-1"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-8 rounded-full px-3.5 text-sm font-medium transition-colors focus-ring',
              checked ? 'bg-white/[0.1] text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
