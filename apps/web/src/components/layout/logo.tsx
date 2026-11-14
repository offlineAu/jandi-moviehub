'use client';

import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The Jandi mark: three frames of one picture, trailing behind each other as they converge —
 * every screen in the room finding the same frame. The nearest frame is solid; the two behind
 * it fade, so the mark still reads as a single play arrow at favicon size.
 *
 * On load the trailing frames slide in from the left and settle into the line ("sync in"); on
 * hover they drift apart again; `loop` keeps them breathing, in and out of sync.
 */
export function LogoMark({
  className,
  animate = 'in',
  title,
}: {
  className?: string;
  animate?: 'in' | 'loop' | 'none';
  title?: string;
}) {
  const id = React.useId().replace(/:/g, '');
  const echo =
    animate === 'loop'
      ? 'animate-[sync-loop_1.8s_var(--ease-in-out-cinema)_infinite]'
      : animate === 'in'
        ? 'animate-[sync-in_1.1s_var(--ease-expo)_backwards]'
        : '';
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn('shrink-0 overflow-visible', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9333ea" />
          <stop offset="0.55" stopColor="#db2777" />
          <stop offset="1" stopColor="#fb7185" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="0.25" cy="0.15" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="11.5" fill={`url(#${id}-tile)`} />
      <rect width="40" height="40" rx="11.5" fill={`url(#${id}-shine)`} />
      {/* The two trailing frames are soft ghosts; the frame in focus is drawn crisply. */}
      <g fill="#fff">
        {/* The furthest frame. */}
        <path
          d="M10.90 12.90 Q9.80 13.60 9.80 14.20 V25.80 Q9.80 26.40 10.90 27.10 L18.90 18.40 Q20.60 19.20 20.60 20.00 Q20.60 20.80 18.90 21.60 Z"
          opacity="0.22"
          style={{ '--sync-from': '-8px', transformBox: 'fill-box' } as React.CSSProperties}
          className={cn(
            echo,
            'transition-transform duration-500 ease-[var(--ease-expo)] group-hover/logo:-translate-x-[2.5px]',
          )}
        />
        {/* The middle frame. */}
        <path
          d="M14.30 12.90 Q13.20 13.60 13.20 14.20 V25.80 Q13.20 26.40 14.30 27.10 L22.30 18.40 Q24.00 19.20 24.00 20.00 Q24.00 20.80 22.30 21.60 Z"
          opacity="0.5"
          style={{ '--sync-from': '-4px', transformBox: 'fill-box' } as React.CSSProperties}
          className={cn(
            echo,
            '[animation-delay:70ms] transition-transform duration-500 ease-[var(--ease-expo)] group-hover/logo:-translate-x-[1.25px]',
          )}
        />
        {/* The frame in focus. */}
        <path
          d="M17.70 12.90 Q16.60 13.60 16.60 14.20 V25.80 Q16.60 26.40 17.70 27.10 L25.70 18.40 Q27.40 19.20 27.40 20.00 Q27.40 20.80 25.70 21.60 Z"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinejoin="round"
          className="origin-center transition-transform duration-500 ease-[var(--ease-expo)] [transform-box:fill-box] group-hover/logo:scale-110"
        />
      </g>
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        'group/logo tap-row inline-flex items-center gap-2.5 rounded-lg font-display focus-ring',
        className,
      )}
      aria-label="Jandi MovieHub"
    >
      <LogoMark className="size-8 transition-transform duration-500 ease-[var(--ease-expo)] group-hover/logo:-rotate-6 group-active/logo:scale-95" />
      {compact ? null : (
        // The name is one word; the descriptor is a film-credit line, set off by a hairline.
        // The descriptor carries the space so the visible text reads as the product name.
        <span className="flex items-center leading-none">
          <span className="text-brand text-[21px] font-bold tracking-[-0.045em]">Jandi</span>
          <span aria-hidden="true" className="mx-2.5 h-[15px] w-px bg-white/25" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.19em] text-muted transition-colors group-hover/logo:text-foreground/80">
            {' MovieHub'}
          </span>
        </span>
      )}
    </Link>
  );
}
