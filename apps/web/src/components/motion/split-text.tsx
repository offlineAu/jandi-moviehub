'use client';

import { motion } from 'motion/react';
import * as React from 'react';
import { EASE_EXPO } from './reveal';

/**
 * Words rising out of a mask, like set type sliding into a gate. The full string stays in the
 * accessibility tree once (sr-only); the animated pieces are aria-hidden.
 * Re-keys on `text` so a new title replays the rise.
 */
export function SplitWords({
  text,
  delay = 0,
  stagger = 0.045,
  immediate = true,
  className,
}: {
  text: string;
  delay?: number;
  stagger?: number;
  immediate?: boolean;
  className?: string;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  const shown = { y: '0%', opacity: 1, rotate: 0 };
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" key={text}>
        {words.map((word, i) => (
          <React.Fragment key={`${word}-${i}`}>
            <span className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
              <motion.span
                className="inline-block will-change-transform"
                initial={{ y: '105%', opacity: 0, rotate: 4 }}
                {...(immediate
                  ? { animate: shown }
                  : { whileInView: shown, viewport: { once: true, margin: '0px 0px -10% 0px' } })}
                transition={{ duration: 0.9, ease: EASE_EXPO, delay: delay + i * stagger }}
              >
                {word}
              </motion.span>
            </span>
            {i < words.length - 1 ? ' ' : null}
          </React.Fragment>
        ))}
      </span>
    </span>
  );
}
