'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_EXPO, Reveal } from '@/components/motion/reveal';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Horizontally scrolling rail with snap, prev/next buttons and keyboard scrolling
 * (the list is a focusable region; arrow keys / Home / End scroll it).
 */
export function ScrollRail({
  title,
  description,
  action,
  children,
  className,
  itemCount,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  itemCount?: number;
}) {
  const id = React.useId();
  const listId = `${id}-list`;
  const headingId = `${id}-heading`;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: true, end: false });

  const update = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  React.useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update, itemCount]);

  const page = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const reduce =
      document.documentElement.dataset.reduceMotion === 'true' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    if (e.key === 'Home') {
      e.preventDefault();
      el.scrollTo({ left: 0 });
    } else if (e.key === 'End') {
      e.preventDefault();
      el.scrollTo({ left: el.scrollWidth });
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      page(1);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      page(-1);
    }
  };

  return (
    <section aria-labelledby={headingId} className={cn('relative min-w-0', className)}>
      <div className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Reveal className="min-w-0" y={16}>
          <h2
            id={headingId}
            className="font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl"
          >
            {title}
          </h2>
          <motion.span
            aria-hidden="true"
            className="mt-1.5 block h-[2px] w-10 origin-left rounded-full bg-[linear-gradient(90deg,var(--primary),var(--accent))]"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: EASE_EXPO, delay: 0.25 }}
          />
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </Reveal>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              aria-controls={listId}
              aria-label={`Scroll ${title} left`}
              disabled={edges.start}
              onClick={() => page(-1)}
              className="grid size-9 tap-target place-items-center rounded-full border border-border-strong text-foreground transition-[background-color,transform,opacity] hover:-translate-x-0.5 hover:bg-glass-3 active:scale-90 focus-ring disabled:opacity-30 disabled:hover:translate-x-0"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-controls={listId}
              aria-label={`Scroll ${title} right`}
              disabled={edges.end}
              onClick={() => page(1)}
              className="grid size-9 tap-target place-items-center rounded-full border border-border-strong text-foreground transition-[background-color,transform,opacity] hover:translate-x-0.5 hover:bg-glass-3 active:scale-90 focus-ring disabled:opacity-30 disabled:hover:translate-x-0"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div
        ref={scrollerRef}
        id={listId}
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        onScroll={update}
        onKeyDown={onKeyDown}
        className="scrollbar-none flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset sm:scroll-px-6 sm:gap-4 sm:px-6 lg:scroll-px-10 lg:px-10"
      >
        {children}
      </div>
    </section>
  );
}
