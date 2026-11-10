'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { isActive, mobileTabs } from './nav-items';

const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'range',
  'file',
  'color',
  'button',
  'submit',
  'reset',
  'image',
]);

/** True for elements that raise the on-screen keyboard. */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable === true;
}

/** A focus this soon after a touch/click counts as user-initiated. */
const GESTURE_WINDOW_MS = 1000;

/**
 * Whether the on-screen keyboard is likely up: a text field has focus and that focus came from the
 * user (phones don't raise the keyboard for programmatic focus such as `autoFocus`). While it is,
 * a fixed bottom bar would ride on top of the keyboard and cover the field being typed in.
 */
function useTyping() {
  const [typing, setTyping] = React.useState(false);
  React.useEffect(() => {
    let lastGesture = -Infinity;
    let current = false;
    const set = (next: boolean) => {
      current = next;
      setTyping(next);
    };
    const onGesture = () => {
      lastGesture = performance.now();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!isTextEntry(e.target as Element | null)) return set(false);
      // Keyboard "next/previous field" moves have no gesture but keep the keyboard up.
      if (current || performance.now() - lastGesture < GESTURE_WINDOW_MS) set(true);
    };
    // focusout fires before focus lands on the next element; re-check once it has.
    const onFocusOut = () =>
      window.setTimeout(() => {
        if (!isTextEntry(document.activeElement)) set(false);
      }, 0);
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return typing;
}

export function MobileTabBar() {
  const pathname = usePathname();
  const typing = useTyping();
  return (
    <nav
      aria-label="Primary"
      data-typing={typing || undefined}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden',
        typing && 'hidden',
      )}
    >
      <ul className="grid h-16 grid-cols-5">
        {mobileTabs.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-ring',
                  active ? 'text-foreground' : 'text-muted',
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-tab-indicator"
                    aria-hidden="true"
                    className="absolute top-0 h-[2px] w-8 rounded-full bg-brand"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <item.icon
                  className={cn(
                    'size-5 transition-transform duration-300 ease-[var(--ease-expo)]',
                    active && 'scale-110 text-primary',
                  )}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
