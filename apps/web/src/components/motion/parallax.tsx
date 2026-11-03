'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useMotionOff } from './use-motion-off';

/**
 * Scroll-linked depth for a full-bleed backdrop: as its section scrolls away, the picture drifts
 * down (slower than the page) and the foreground copy lifts and fades. Locked to the scrollbar,
 * no smoothing. Travel stays under ~8% of the element; pictures are held oversized in the frame.
 */
export function ParallaxBackdrop({
  children,
  className,
  strength = 0.18,
}: {
  children: React.ReactNode;
  className?: string;
  /** Fraction of the section height the backdrop travels over a full scroll-out. */
  strength?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const off = useMotionOff();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', `${strength * 100}%`]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.06, 1.14]);
  return (
    <div ref={ref} className={cn('absolute inset-0 overflow-hidden', className)}>
      <motion.div
        className="absolute inset-0 will-change-transform"
        style={off ? undefined : { y, scale }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Foreground layer that lifts and fades as its section scrolls out of view. */
export function ScrollFade({
  children,
  className,
  distance = 80,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const off = useMotionOff();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.6', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  const opacity = useTransform(scrollYProgress, [0.35, 1], [1, 0]);
  return (
    <motion.div ref={ref} className={className} style={off ? undefined : { y, opacity }}>
      {children}
    </motion.div>
  );
}
