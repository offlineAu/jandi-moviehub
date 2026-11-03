'use client';

import { APP_NAME, APP_TAGLINE } from '@jandi/shared';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/motion/reveal';
import { useCatalogInfo } from '@/lib/queries/catalog';
import { Logo } from './logo';

export function CatalogAttribution() {
  const info = useCatalogInfo();
  if (!info.data) return null;
  const { provider, attribution, attributionUrl, label } = info.data;
  if (provider === 'local') {
    return (
      <div className="grid gap-1 text-xs leading-relaxed text-muted">
        <p>Demo catalog — titles and artwork marked DEMO are demonstration content.</p>
        {attribution ? <p className="text-subtle">{attribution}</p> : null}
      </div>
    );
  }
  return (
    <p className="text-xs leading-relaxed text-muted">
      {attribution ?? `Metadata provided by ${label}.`}{' '}
      {attributionUrl ? (
        <a href={attributionUrl} target="_blank" rel="noopener noreferrer" className="link-fx">
          {label}
        </a>
      ) : null}
    </p>
  );
}

const linkClass =
  'group/fl inline-flex w-fit items-center gap-1 rounded text-[15px] text-foreground/70 transition-colors duration-300 hover:text-foreground focus-ring';

const columns = [
  {
    title: 'Discover',
    links: [
      { href: '/browse', label: 'Browse movies' },
      { href: '/series', label: 'Series' },
      { href: '/search', label: 'Search' },
    ],
  },
  {
    title: 'Watch together',
    links: [
      { href: '/rooms', label: 'Watch parties' },
      { href: '/rooms/new', label: 'Host a room' },
      { href: '/playlists', label: 'Marathons' },
    ],
  },
  {
    title: 'You',
    links: [
      { href: '/library', label: 'Library' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden px-4 pb-28 pt-16 sm:px-6 md:pb-12 lg:px-10">
      {/* Top edge: a hairline with light running along it, and a soft glow spilling down. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px overflow-hidden bg-white/[0.07]"
      >
        <div className="h-full w-1/2 animate-[line-sweep_6s_var(--ease-in-out-cinema)_infinite] bg-gradient-to-r from-transparent via-accent to-transparent" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[min(900px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(168_85_247/0.18),transparent)]"
      />

      <Stagger className="grid gap-12 lg:grid-cols-[1.3fr_2fr]" stagger={0.08}>
        <StaggerItem className="grid max-w-sm content-start gap-4">
          <Logo />
          <p className="text-[15px] leading-relaxed text-foreground/75">
            {APP_TAGLINE} Server-synced watch parties, live chat and movie marathons.
          </p>
        </StaggerItem>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
          {columns.map((col) => (
            <StaggerItem key={col.title}>
              <h2 className="text-sm font-semibold text-foreground">{col.title}</h2>
              <ul className="mt-4 grid gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link className={linkClass} href={l.href}>
                      {l.label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-3.5 -translate-x-1 translate-y-0.5 opacity-0 transition-[opacity,transform] duration-300 ease-[var(--ease-expo)] group-hover/fl:translate-x-0 group-hover/fl:translate-y-0 group-hover/fl:opacity-100"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </StaggerItem>
          ))}
        </nav>
      </Stagger>

      <div className="mt-14 pt-6 text-xs text-subtle">
        <p>
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>
    </footer>
  );
}
