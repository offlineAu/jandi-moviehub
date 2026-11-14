'use client';

import { Search, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export interface SearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange' | 'size'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible label (also used as placeholder when none is given). */
  label: string;
  size?: 'md' | 'lg';
  /** Swaps the magnifier for a spinner while results load. */
  busy?: boolean;
  /** Shown at the right edge while the field is empty (e.g. a keyboard shortcut hint). */
  endAdornment?: React.ReactNode;
}

/**
 * Pill search field. On focus a brand-gradient rim lights up around it and the magnifier picks up
 * the accent — the field reads as the place to start.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onValueChange,
      label,
      className,
      placeholder,
      size = 'md',
      busy = false,
      endAdornment,
      ...props
    },
    ref,
  ) => (
    <div className={cn('group/search relative isolate', className)}>
      {/* Gradient rim + glow, revealed on focus. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px -z-10 rounded-full bg-[linear-gradient(110deg,var(--primary),var(--accent)_55%,var(--iris))] opacity-0 transition-opacity duration-300 group-focus-within/search:opacity-100"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 -z-20 rounded-full bg-[radial-gradient(60%_80%_at_50%_50%,rgb(168_85_247/0.28),transparent)] opacity-0 blur-md transition-opacity duration-500 group-focus-within/search:opacity-100"
      />
      <span
        className={cn(
          'pointer-events-none absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center text-muted transition-[color,transform] duration-300 ease-[var(--ease-expo)] group-focus-within/search:scale-110 group-focus-within/search:text-[#e9d5ff]',
          size === 'lg' ? 'left-5' : 'left-4',
        )}
        aria-hidden="true"
      >
        {busy ? (
          <Spinner className="size-4" label="" />
        ) : (
          <Search className={size === 'lg' ? 'size-5' : 'size-4'} />
        )}
      </span>
      <input
        ref={ref}
        type="search"
        role="searchbox"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          'w-full rounded-full border border-border-strong bg-[#0f0f1a]/90 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_10px_30px_-18px_rgb(0_0_0/0.9)] outline-none backdrop-blur-xl transition-[border-color,background-color] duration-300 placeholder:text-subtle hover:border-border-strong hover:bg-[#13131f] focus:border-transparent focus:bg-[#11111d] [&::-webkit-search-cancel-button]:hidden',
          size === 'lg' ? 'h-14 pl-13 pr-14 text-base' : 'h-10 pl-10 pr-12 text-sm',
        )}
        autoComplete="off"
        spellCheck={false}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange('')}
          className={cn(
            'absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full bg-glass-2 text-muted transition-[background-color,color,transform] duration-200 hover:rotate-90 hover:bg-glass-4 hover:text-foreground active:scale-90 focus-ring',
            size === 'lg' ? 'right-3 size-8' : 'right-2 size-6',
          )}
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : endAdornment ? (
        <span className="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 transition-opacity duration-200 group-focus-within/search:opacity-0">
          {endAdornment}
        </span>
      ) : null}
    </div>
  ),
);
SearchInput.displayName = 'SearchInput';

/** Small keyboard key, for shortcut hints. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/10 bg-glass-2 px-1.5 font-sans text-[11px] font-medium text-muted shadow-[inset_0_-1px_0_rgb(255_255_255/0.06)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
