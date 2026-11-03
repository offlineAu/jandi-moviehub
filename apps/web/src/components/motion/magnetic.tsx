'use client';

import { motion, useSpring } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFinePointer, useMotionOff } from './use-motion-off';

const SPRING = { stiffness: 300, damping: 20, mass: 0.5 };

/** Pulls its child a few pixels toward the pointer: for the one or two primary calls to action. */
export function Magnetic({
  children,
  className,
  strength = 0.25,
  max = 10,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
  max?: number;
}) {
  const off = useMotionOff();
  const fine = useFinePointer();
  const enabled = fine && !off;
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const clamp = (v: number) => Math.max(-max, Math.min(max, v));
  return (
    <motion.div
      className={cn('inline-flex', className)}
      style={enabled ? { x, y } : undefined}
      onPointerMove={(e) => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(clamp((e.clientX - (r.left + r.width / 2)) * strength));
        y.set(clamp((e.clientY - (r.top + r.height / 2)) * strength));
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
