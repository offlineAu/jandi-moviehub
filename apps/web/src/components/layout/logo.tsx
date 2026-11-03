'use client';

import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The Jandi mark: three play glyphs that slide together and lock into one — every screen in the
 * room on the same frame. On load the echoes converge ("sync in"); on hover they drift apart and
 * snap back. `loop` keeps them breathing in and out (route loader).
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
      <g
        fill="#fff"
        stroke="#fff"
        strokeWidth="3"
        strokeLinejoin="round"
        transform="translate(1.75 0)"
      >
        <path
          d="M9 13v14l10.5-7z"
          opacity="0.3"
          style={{ '--sync-from': '-5px', transformBox: 'fill-box' } as React.CSSProperties}
          className={cn(
            echo,
            'transition-transform duration-500 ease-[var(--ease-expo)] group-hover/logo:-translate-x-[2.5px]',
          )}
        />
        <path
          d="M12.5 13v14l10.5-7z"
          opacity="0.58"
          style={{ '--sync-from': '-3px', transformBox: 'fill-box' } as React.CSSProperties}
          className={cn(
            echo,
            '[animation-delay:60ms] transition-transform duration-500 ease-[var(--ease-expo)] group-hover/logo:-translate-x-[1.25px]',
          )}
        />
        <path
          d="M16 13v14l10.5-7z"
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
        'group/logo inline-flex items-center gap-2.5 rounded-lg font-display focus-ring',
        className,
      )}
      aria-label="Jandi MovieHub home"
    >
      <LogoMark className="size-8 transition-transform duration-500 ease-[var(--ease-expo)] group-hover/logo:-rotate-6 group-active/logo:scale-95" />
      {compact ? null : (
        <span className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[21px] font-bold tracking-[-0.045em] text-white">Jandi</span>
          <span className="hidden text-[13px] font-medium tracking-[-0.01em] text-muted transition-colors group-hover/logo:text-foreground/80 min-[380px]:inline">
            MovieHub
          </span>
        </span>
      )}
    </Link>
  );
}
