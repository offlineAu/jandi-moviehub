'use client';

import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFinePointer, useMotionOff } from './use-motion-off';

const SPRING = { stiffness: 260, damping: 24, mass: 0.6 };

/**
 * A card that leans toward the pointer with a moving glare, like a poster catching the
 * projector light. Mouse/trackpad only; touch and reduced motion get a flat card.
 */
export function Tilt({
  children,
  className,
  max = 9,
  glare = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Max rotation in degrees. */
  max?: number;
  glare?: boolean;
}) {
  const off = useMotionOff();
  const fine = useFinePointer();
  const enabled = fine && !off;
  const rx = useSpring(0, SPRING);
  const ry = useSpring(0, SPRING);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glareBg = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgb(255 255 255 / 0.22), transparent 55%)`;
  const [hover, setHover] = React.useState(false);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * max);
    rx.set(-(py - 0.5) * 2 * max);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
    setHover(false);
  };

  return (
    <div className={cn('[perspective:900px]', className)}>
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        style={enabled ? { rotateX: rx, rotateY: ry } : undefined}
        onPointerMove={onMove}
        onPointerEnter={() => enabled && setHover(true)}
        onPointerLeave={reset}
      >
        {children}
        {glare && enabled ? (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] mix-blend-soft-light transition-opacity duration-300"
            style={{ background: glareBg, opacity: hover ? 1 : 0 }}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
