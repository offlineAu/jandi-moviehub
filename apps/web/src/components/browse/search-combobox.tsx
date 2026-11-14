'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CornerDownLeft, Flame, Play, SearchX, Star, Tv } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as React from 'react';
import { HOME_TRENDING } from '@/components/home/home-rails';
import { EASE_EXPO } from '@/components/motion/reveal';
import { Artwork } from '@/components/movies/artwork';
import { Kbd, SearchInput } from '@/components/ui/search-input';
import { apiFetch } from '@/lib/api';
import { useMovies } from '@/lib/queries/catalog';
import { cn, formatRating } from '@/lib/utils';

type TvItem = {
  id: number;
  title: string;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  firstAirDate: string | null;
};

type Result = {
  key: string;
  href: string;
  kind: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  rating: string | null;
  genres: string[];
  playable: boolean;
};

const MIN_CHARS = 2;

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function useSearchResults(text: string, open: boolean) {
  const q = useDebounced(text.trim(), 220);
  const enabled = open && q.length >= MIN_CHARS && q === text.trim();
  const movies = useMovies({ q, page: 1, pageSize: 6 }, { enabled });
  const tv = useQuery({
    queryKey: ['tv-search-suggestions', q],
    queryFn: ({ signal }) => apiFetch<{ items: TvItem[] }>('/tv/search', { signal, query: { q } }),
    enabled,
    staleTime: 300_000,
    retry: false,
  });
  // Shown before typing: what everyone is watching (usually already cached by the home page).
  // Observed only once opened: this box renders in the layout, before the home page's
  // server-prefetched trending list, and must not pre-create that list's cache entry.
  const trending = useMovies(open ? HOME_TRENDING : null);

  const movieResults: Result[] = (movies.isPlaceholderData ? [] : (movies.data?.items ?? []))
    .slice(0, 6)
    .map((m) => ({
      key: `movie-${m.id}`,
      href: `/movies/${m.id}`,
      kind: 'movie',
      title: m.title,
      year: m.year ? String(m.year) : null,
      posterUrl: m.posterUrl,
      backdropUrl: m.backdropUrl,
      overview: m.overview,
      rating: formatRating(m.voteAverage),
      genres: m.genres,
      playable: m.playable,
    }));
  const tvResults: Result[] = (tv.data?.items ?? []).slice(0, 4).map((t) => ({
    key: `tv-${t.id}`,
    href: `/tv/${t.id}`,
    kind: 'tv',
    title: t.title,
    year: t.firstAirDate?.slice(0, 4) ?? null,
    posterUrl: t.posterUrl,
    backdropUrl: t.backdropUrl,
    overview: t.overview,
    rating: null,
    genres: [],
    playable: false,
  }));
  const trendingResults: Result[] = (trending.data?.items ?? []).slice(0, 5).map((m) => ({
    key: `trend-${m.id}`,
    href: `/movies/${m.id}`,
    kind: 'movie',
    title: m.title,
    year: m.year ? String(m.year) : null,
    posterUrl: m.posterUrl,
    backdropUrl: m.backdropUrl,
    overview: m.overview,
    rating: formatRating(m.voteAverage),
    genres: m.genres,
    playable: m.playable,
  }));

  const typing = text.trim().length >= MIN_CHARS;
  const loading =
    typing && (!enabled || movies.isFetching || tv.isFetching) && !movieResults.length;
  return { q: text.trim(), typing, loading, movieResults, tvResults, trendingResults };
}

/** Wraps the matched part of a title so it reads at a glance. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-primary/25 px-px text-white">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}

function KindTag({ kind }: { kind: Result['kind'] }) {
  return kind === 'tv' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-iris/15 px-2 py-0.5 text-[11px] font-medium text-[#7dd3fc]">
      <Tv className="size-3" aria-hidden="true" />
      Series
    </span>
  ) : (
    <span className="rounded-full bg-glass-3 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
      Movie
    </span>
  );
}

function Meta({ r }: { r: Result }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
      <KindTag kind={r.kind} />
      {r.year ? <span>{r.year}</span> : null}
      {r.rating ? (
        <span className="inline-flex items-center gap-0.5">
          <Star className="size-3 fill-warning text-warning" aria-hidden="true" />
          {r.rating}
        </span>
      ) : null}
      {r.genres[0] ? <span className="truncate">{r.genres.slice(0, 2).join(' · ')}</span> : null}
    </span>
  );
}

export function SearchCombobox({
  value,
  onValueChange,
  onSubmit,
  label,
  placeholder,
  size = 'md',
  shortcut = false,
  inputRef,
  maxLength,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  /** Enter with nothing highlighted, or the "all results" row. */
  onSubmit: (q: string) => void;
  label: string;
  placeholder?: string;
  size?: 'md' | 'lg';
  /** Register ⌘K / Ctrl K and "/" to focus this field, and show the hint. */
  shortcut?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  maxLength?: number;
  className?: string;
}) {
  const router = useRouter();
  const id = React.useId();
  const listId = `${id}-list`;
  const ownRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(inputRef, () => ownRef.current as HTMLInputElement);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [mac, setMac] = React.useState(false);
  const r = useSearchResults(value, open);

  React.useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.userAgent)), []);
  React.useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        ownRef.current?.focus();
        ownRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  // Flat, ordered option list: what arrow keys walk through.
  const options: Result[] = r.typing ? [...r.movieResults, ...r.tvResults] : r.trendingResults;
  const allRow = r.typing ? { key: 'all', href: `/search?q=${encodeURIComponent(r.q)}` } : null;
  const count = options.length + (allRow ? 1 : 0);
  const optId = (i: number) => `${id}-opt-${i}`;

  React.useEffect(() => setActive(-1), [value]);
  React.useEffect(() => {
    if (active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const go = (i: number) => {
    close();
    if (allRow && i === options.length) onSubmit(r.q);
    else if (options[i]) router.push(options[i].href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!count) return;
      e.preventDefault();
      setOpen(true);
      const d = e.key === 'ArrowDown' ? 1 : -1;
      // Cycle through every option and back to the field itself (-1).
      setActive((a) => {
        const pos = a < 0 ? count : a;
        const next = (pos + d + count + 1) % (count + 1);
        return next === count ? -1 : next;
      });
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      go(active);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      } else {
        ownRef.current?.blur();
      }
    }
  };

  const showPanel = open && (count > 0 || r.loading || r.typing);
  const top = r.typing ? (r.movieResults[0] ?? r.tvResults[0]) : undefined;

  const row = (item: Result, i: number) => (
    <li
      key={item.key}
      id={optId(i)}
      role="option"
      aria-selected={active === i}
      onPointerMove={() => setActive(i)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => go(i)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go(i);
        }
      }}
      className="group/opt relative flex cursor-pointer items-center gap-3 rounded-xl p-2 pr-3 transition-colors duration-150 aria-selected:bg-glass-3"
    >
      <motion.span
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: EASE_EXPO, delay: Math.min(i, 8) * 0.03 }}
        className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-white/10 transition-transform duration-300 ease-[var(--ease-expo)] group-aria-selected/opt:scale-105"
      >
        <Artwork src={item.posterUrl} alt="" sizes="48px" fallbackTitle="" />
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          <Highlight text={item.title} query={r.typing ? r.q : ''} />
        </span>
        <span className="mt-1 block">
          <Meta r={item} />
        </span>
      </span>
      {item.playable ? (
        <span className="hidden items-center gap-1 text-[11px] font-medium text-[#6ee7b7] sm:inline-flex">
          <Play className="size-3 fill-current" aria-hidden="true" />
          Playable
        </span>
      ) : null}
      <ArrowRight
        aria-hidden="true"
        className="size-4 shrink-0 -translate-x-1 text-muted opacity-0 transition-[opacity,transform] duration-300 ease-[var(--ease-expo)] group-aria-selected/opt:translate-x-0 group-aria-selected/opt:opacity-100"
      />
    </li>
  );

  return (
    <form
      role="search"
      // Several search landmarks can be on one page (top nav and the search page), so each one
      // needs its own name to be distinguishable. The name says where the field is, not what it
      // searches for, so it does not collide with the input's own label.
      aria-label={`${label} field`}
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0) return go(active);
        close();
        onSubmit(value.trim());
      }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <SearchInput
        ref={ownRef}
        value={value}
        onValueChange={(v) => {
          onValueChange(v);
          setOpen(true);
        }}
        label={label}
        placeholder={placeholder}
        size={size}
        busy={r.loading}
        maxLength={maxLength}
        name="q"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optId(active) : undefined}
        onKeyDown={onKeyDown}
        endAdornment={
          shortcut ? (
            <span className="flex gap-1">
              <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>K</Kbd>
            </span>
          ) : undefined
        }
      />

      <AnimatePresence>
        {showPanel ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99, transition: { duration: 0.15 } }}
            transition={{ duration: 0.35, ease: EASE_EXPO }}
            className={cn(
              'absolute left-0 top-full z-50 mt-3 origin-top overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d17]/95 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.95),0_0_0_1px_rgb(168_85_247/0.08),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-2xl',
              size === 'lg'
                ? 'right-0'
                : 'w-[min(34rem,calc(100vw-2rem))] max-md:right-0 lg:-left-6',
            )}
          >
            <div className="max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain p-2">
              {/* Top result: the best match, set large with its backdrop. */}
              {top && !r.loading ? (
                <Link
                  href={top.href}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={close}
                  className="group/top relative mb-2 block h-36 overflow-hidden rounded-xl ring-1 ring-white/10"
                  aria-hidden="true"
                >
                  <motion.span
                    className="absolute inset-0"
                    initial={{ scale: 1.08, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8, ease: EASE_EXPO }}
                  >
                    <span className="absolute inset-0 transition-transform duration-700 ease-[var(--ease-expo)] group-hover/top:scale-105">
                      <Artwork
                        src={top.backdropUrl ?? top.posterUrl}
                        alt=""
                        sizes="544px"
                        kind="backdrop"
                        fallbackTitle={top.title}
                      />
                    </span>
                  </motion.span>
                  <span className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_8_16/0.95)_0%,rgb(8_8_16/0.7)_45%,rgb(8_8_16/0.1)_100%)]" />
                  <span className="relative flex h-full flex-col justify-end p-4">
                    <span className="mb-1 text-[11px] font-medium text-[#f0abfc]">Top result</span>
                    <span className="line-clamp-1 font-display text-xl font-bold tracking-[-0.02em] text-white">
                      {top.title}
                    </span>
                    <span className="mt-1.5">
                      <Meta r={top} />
                    </span>
                    {top.overview ? (
                      <span className="mt-1.5 line-clamp-1 max-w-sm text-xs text-white/70">
                        {top.overview}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ) : null}

              <div
                role="listbox"
                id={listId}
                aria-label={r.typing ? 'Search results' : 'Trending now'}
              >
                {r.loading ? (
                  <ul
                    role="group"
                    aria-label="Loading results"
                    aria-busy="true"
                    className="grid gap-1"
                  >
                    {Array.from({ length: 4 }, (_, i) => (
                      <li
                        key={i}
                        role="option"
                        aria-selected={false}
                        aria-disabled="true"
                        className="flex items-center gap-3 p-2"
                      >
                        <span className="shimmer aspect-[2/3] w-10 rounded-md" />
                        <span className="grid flex-1 gap-2">
                          <span className="shimmer h-3.5 w-2/3 rounded" />
                          <span className="shimmer h-3 w-1/3 rounded" />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : !r.typing ? (
                  <ul role="group" aria-labelledby={`${id}-trend`} className="grid gap-0.5">
                    <li
                      role="presentation"
                      id={`${id}-trend`}
                      className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-xs font-medium text-muted"
                    >
                      <Flame className="size-3.5 text-accent" aria-hidden="true" />
                      Trending now
                    </li>
                    {r.trendingResults.map((item, i) => row(item, i))}
                  </ul>
                ) : count === (allRow ? 1 : 0) ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                    <SearchX className="size-6 text-muted" aria-hidden="true" />
                    <p className="text-sm font-medium">No quick matches for “{r.q}”</p>
                    <p className="text-xs text-muted">Press Enter to search the whole catalog.</p>
                  </div>
                ) : (
                  <>
                    {r.movieResults.length ? (
                      <ul role="group" aria-labelledby={`${id}-mv`} className="grid gap-0.5">
                        <li
                          role="presentation"
                          id={`${id}-mv`}
                          className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted"
                        >
                          Movies
                        </li>
                        {r.movieResults.map((item, i) => row(item, i))}
                      </ul>
                    ) : null}
                    {r.tvResults.length ? (
                      <ul role="group" aria-labelledby={`${id}-tv`} className="mt-1 grid gap-0.5">
                        <li
                          role="presentation"
                          id={`${id}-tv`}
                          className="px-2 pb-1 pt-2 text-xs font-medium text-muted"
                        >
                          Series
                        </li>
                        {r.tvResults.map((item, i) => row(item, r.movieResults.length + i))}
                      </ul>
                    ) : null}
                  </>
                )}
                {allRow && !r.loading ? (
                  <div
                    id={optId(options.length)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={active === options.length}
                    onPointerMove={() => setActive(options.length)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(options.length)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        go(options.length);
                      }
                    }}
                    className="group/opt mt-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground/85 transition-colors aria-selected:bg-glass-3 aria-selected:text-foreground"
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-white transition-transform duration-300 group-aria-selected/opt:scale-110">
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                    See all results for <span className="font-semibold text-white">“{r.q}”</span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="hidden items-center justify-between gap-4 border-t border-glass-3 bg-glass-1 px-4 py-2 text-[11px] text-muted md:flex">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> to move
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>
                    <CornerDownLeft className="size-3" aria-hidden="true" />
                  </Kbd>
                  to open
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> to close
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
}
