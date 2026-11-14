'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { SearchCombobox } from '@/components/browse/search-combobox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/queries/auth';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { isActive, primaryNav } from './nav-items';
import { UserMenu } from './user-menu';

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const [scrolled, setScrolled] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      // Tuck the bar away while reading downward; bring it back on any upward scroll.
      if (Math.abs(y - last) > 6) {
        setHidden(y > last && y > 240);
        last = y;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const user = me.data;
  const next = encodeURIComponent(pathname || '/');

  return (
    <motion.header
      initial={false}
      animate={{ y: hidden ? '-100%' : '0%' }}
      transition={{ duration: 0.35, ease: [0.76, 0, 0.24, 1] }}
      className={cn(
        'sticky top-0 z-40 h-16 transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-b border-border bg-background/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-gradient-to-b from-black/70 to-transparent',
      )}
    >
      <div className="flex h-full items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-6">
        <Logo />
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {primaryNav.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative isolate inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors focus-ring',
                      active ? 'text-foreground' : 'text-foreground/75 hover:text-foreground',
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="top-nav-pill"
                        aria-hidden="true"
                        className="absolute inset-0 -z-10 rounded-full bg-glass-4 ring-1 ring-white/10"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    ) : null}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <SearchCombobox
          value={query}
          onValueChange={setQuery}
          onSubmit={(q) => router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search')}
          label="Search movies and series"
          placeholder="Search movies, series…"
          shortcut
          className="ml-auto hidden w-full max-w-xs md:block lg:max-w-sm"
        />

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {me.isLoading ? (
            <Skeleton className="size-8 rounded-full" />
          ) : user ? (
            <>
              {!user.isGuest ? <NotificationBell /> : null}
              <UserMenu me={user} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="h-9 tap-row">
                <Link href={`/login?next=${next}`}>Log in</Link>
              </Button>
              <Button asChild size="sm" className="hidden h-9 tap-row min-[400px]:inline-flex">
                <Link href="/register">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}
