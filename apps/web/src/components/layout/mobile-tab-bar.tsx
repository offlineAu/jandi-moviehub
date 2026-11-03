'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isActive, mobileTabs } from './nav-items';

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
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
