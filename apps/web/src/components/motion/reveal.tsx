'use client';

import { motion, type HTMLMotionProps, type Variants } from 'motion/react';
import * as React from 'react';

/** Expo-out: the curve for reveals of 600ms+ (see globals.css `--ease-expo`). */
export const EASE_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Fires when the element's top crosses ~88% of the viewport height, once. */
const VIEWPORT = { once: true, margin: '0px 0px -12% 0px' } as const;

type RevealProps = HTMLMotionProps<'div'> & {
  delay?: number;
  /** Rise distance in px. */
  y?: number;
  /** Adds a short blur-in (≤8px) for pictures and large type. Never use on body text. */
  blur?: boolean;
  /** Animate on mount instead of on entering the viewport (above-the-fold content). */
  immediate?: boolean;
};

/** One element rising into place as it enters the viewport. */
export function Reveal({
  delay = 0,
  y = 24,
  blur = false,
  immediate = false,
  children,
  ...props
}: RevealProps) {
  const hidden = { opacity: 0, y, ...(blur ? { filter: 'blur(8px)' } : {}) };
  const shown = { opacity: 1, y: 0, ...(blur ? { filter: 'blur(0px)' } : {}) };
  return (
    <motion.div
      initial={hidden}
      {...(immediate ? { animate: shown } : { whileInView: shown, viewport: VIEWPORT })}
      transition={{ duration: 0.8, ease: EASE_EXPO, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

const groupVariants = (stagger: number, delay: number): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_EXPO } },
};

export const popVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE_EXPO } },
};

export const slideVariants: Variants = {
  hidden: { opacity: 0, x: 48, scale: 0.94 },
  shown: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.9, ease: EASE_EXPO } },
};

type StaggerProps<T extends 'div' | 'ul' | 'ol' | 'dl'> = HTMLMotionProps<T> & {
  as?: T;
  /** Seconds between children (lists: 0.05–0.1). */
  stagger?: number;
  delay?: number;
  immediate?: boolean;
};

/**
 * Container whose `StaggerItem` children arrive in reading order. Children inherit the
 * hidden/shown variants, so nest `StaggerItem`s (or any motion element with `variants`).
 */
export function Stagger<T extends 'div' | 'ul' | 'ol' | 'dl' = 'div'>({
  as,
  stagger = 0.07,
  delay = 0,
  immediate = false,
  children,
  ...props
}: StaggerProps<T>) {
  const Comp = motion[(as ?? 'div') as 'div'] as React.ElementType;
  return (
    <Comp
      variants={groupVariants(stagger, delay)}
      initial="hidden"
      {...(immediate ? { animate: 'shown' } : { whileInView: 'shown', viewport: VIEWPORT })}
      {...props}
    >
      {children}
    </Comp>
  );
}

type ItemProps<T extends 'div' | 'li' | 'span' | 'p'> = HTMLMotionProps<T> & {
  as?: T;
  variant?: 'rise' | 'pop' | 'slide';
};

export function StaggerItem<T extends 'div' | 'li' | 'span' | 'p' = 'div'>({
  as,
  variant = 'rise',
  children,
  ...props
}: ItemProps<T>) {
  const Comp = motion[(as ?? 'div') as 'div'] as React.ElementType;
  return (
    <Comp
      variants={
        variant === 'pop' ? popVariants : variant === 'slide' ? slideVariants : itemVariants
      }
      {...props}
    >
      {children}
    </Comp>
  );
}
