'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Edge-to-edge band that drifts sideways. The content is duplicated once (aria-hidden) so the loop
 * is seamless. Pauses on hover/focus; reduced motion stops it.
 */
export function Marquee({
  children,
  label,
  duration = 60,
  reverse = false,
  className,
}: {
  children: React.ReactNode;
  /** Accessible name of the band (also used for the pause button). */
  label: string;
  /** Seconds for one full loop. */
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div
      data-marquee
      role="region"
      aria-label={label}
      className={cn(
        'relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]',
        className,
      )}
    >
      <div
        data-marquee-track
        className="flex w-max animate-marquee will-change-transform"
        style={
          {
            '--marquee-duration': `${duration}s`,
            animationDirection: reverse ? 'reverse' : 'normal',
          } as React.CSSProperties
        }
      >
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden="true" inert>
          {children}
        </div>
      </div>
    </div>
  );
}
