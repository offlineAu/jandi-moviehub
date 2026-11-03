'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Surface lit by a soft light that follows the pointer (uses the `spotlight` CSS utility).
 * Pure CSS custom properties — no re-renders on pointer move.
 */
export function Spotlight({
  children,
  className,
  as: Comp = 'div',
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'li' | 'article' | 'section' }) {
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <Comp className={cn('spotlight', className)} onPointerMove={onMove} {...props}>
      {children}
    </Comp>
  );
}
