'use client';

import * as React from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const FINE = '(hover: hover) and (pointer: fine)';

function mql(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;
}

function read() {
  if (typeof window === 'undefined') return false;
  return document.documentElement.dataset.reduceMotion === 'true' || !!mql(QUERY)?.matches;
}

function subscribe(onChange: () => void) {
  const mq = mql(QUERY);
  mq?.addEventListener('change', onChange);
  // The account preference toggles `data-reduce-motion` on <html> (see app/providers.tsx).
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-reduce-motion'],
  });
  return () => {
    mq?.removeEventListener('change', onChange);
    observer.disconnect();
  };
}

/**
 * True when motion should be dropped: the OS setting OR the account's reduce-motion preference.
 * Use for script-driven effects that MotionConfig doesn't cover (pointer tilt, WebGL, auto-advance).
 */
export function useMotionOff() {
  return React.useSyncExternalStore(subscribe, read, () => false);
}

/** True for a fine pointer that can hover (mouse/trackpad); false on touch. */
export function useFinePointer() {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = mql(FINE);
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => !!mql(FINE)?.matches,
    () => false,
  );
}
