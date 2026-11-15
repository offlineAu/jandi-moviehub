'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Sponsor } from '@/lib/monetization';

export function SponsorCard({ sponsor }: { sponsor: Sponsor | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!sponsor) return;
    const update = () => setNow(Date.now());
    update();
    // Recheck while the page is open, including after the browser resumes a background tab.
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [sponsor]);

  if (
    !sponsor ||
    now === null ||
    now < Date.parse(sponsor.startsAt) ||
    now >= Date.parse(sponsor.endsAt)
  )
    return null;

  return (
    <aside aria-label="Sponsored" className="px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-glass-3 bg-surface/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">Sponsored</p>
          <p className="mt-1 font-semibold text-foreground">{sponsor.name}</p>
          <p className="mt-1 text-sm text-foreground/75">{sponsor.message}</p>
        </div>
        <a
          href={sponsor.url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-sm font-medium text-foreground underline underline-offset-4 focus-ring"
        >
          Visit sponsor <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </div>
    </aside>
  );
}
