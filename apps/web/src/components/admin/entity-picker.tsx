'use client';

import { Check } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Search-and-pick list for choosing a related record (movie, license) inside a form. The chosen
 * record collapses into a summary with a "Change" button.
 */
export function EntityPicker<T>({
  id,
  label,
  items,
  loading,
  error,
  search,
  onSearchChange,
  selected,
  onSelect,
  getKey,
  renderItem,
  renderSelected,
  emptyText,
  invalid,
  describedBy,
}: {
  id: string;
  label: string;
  items: T[] | undefined;
  loading: boolean;
  error: unknown;
  search: string;
  onSearchChange: (value: string) => void;
  selected: T | null;
  onSelect: (item: T | null) => void;
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  emptyText: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const labelId = `${id}-label`;
  if (selected) {
    return (
      <div className="grid gap-2">
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        <div
          className="flex items-center gap-3 rounded-[10px] border border-primary/40 bg-primary/[0.07] p-3"
          aria-labelledby={labelId}
          role="group"
        >
          <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">{renderSelected(selected)}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(null)}
            aria-label={`Change ${label.toLowerCase()}`}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <SearchInput
        id={id}
        label={`Search ${label.toLowerCase()}`}
        value={search}
        onValueChange={onSearchChange}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <div
        className={cn(
          'max-h-56 overflow-y-auto rounded-[10px] border bg-secondary/60 p-1',
          invalid ? 'border-danger/60' : 'border-border-strong',
        )}
      >
        {loading ? (
          <div className="grid gap-1 p-1" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="p-3 text-sm text-danger">
            {errorMessage(error)}
          </p>
        ) : !items?.length ? (
          <p className="p-3 text-sm text-muted">{emptyText}</p>
        ) : (
          <ul className="grid gap-0.5" aria-label={`${label} results`}>
            {items.map((item) => (
              <li key={getKey(item)}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-glass-2 focus-ring"
                >
                  {renderItem(item)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Debounced copy of a value (for search-as-you-type pickers). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
