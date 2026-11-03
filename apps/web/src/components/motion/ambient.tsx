'use client';

import { motion, useScroll, useSpring } from 'motion/react';
import { useMotionOff } from './use-motion-off';

/** Thin brand-gradient bar at the top of the viewport tracking how far the page has scrolled. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });
  const off = useMotionOff();
  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-[linear-gradient(90deg,var(--primary),var(--accent),var(--iris))] shadow-[0_0_12px_rgb(236_72_153/0.7)]"
      style={{ scaleX: off ? scrollYProgress : scaleX }}
    />
  );
}

/**
 * Two pools of projector light drifting slowly behind every page, so the dark ground never sits
 * perfectly still. Gradients only (no blur filter), transform-animated, paused by reduced motion.
 */
export function AmbientLight() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[20vw] top-[20vh] size-[70vmax] animate-[drift-a_38s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(147_51_234/0.13),transparent)]" />
      <div className="absolute -right-[25vw] top-[55vh] size-[75vmax] animate-[drift-b_46s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(219_39_119/0.09),transparent)]" />
      <div className="absolute left-[30vw] -top-[30vh] size-[50vmax] animate-[drift-b_52s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,rgb(56_189_248/0.06),transparent)]" />
    </div>
  );
}
