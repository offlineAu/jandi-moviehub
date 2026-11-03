'use client';

import { ExternalLink, Play } from 'lucide-react';
import * as React from 'react';
import type { Trailer } from '@/lib/types';

/** YouTube trailers load only after an explicit click (privacy-enhanced youtube-nocookie domain). */
export function TrailerEmbed({ trailer }: { trailer: Trailer }) {
  const [loaded, setLoaded] = React.useState(false);
  const safeKey = encodeURIComponent(trailer.key);

  if (trailer.site === 'Vimeo') {
    return (
      <a
        href={`https://vimeo.com/${safeKey}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex aspect-video items-center justify-center gap-2 rounded-xl border border-border-strong bg-secondary text-sm font-medium text-foreground transition-colors hover:border-primary/50 focus-ring"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Watch “{trailer.name}” on Vimeo
      </a>
    );
  }

  if (loaded) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${safeKey}?autoplay=1&rel=0&modestbranding=1`}
        title={trailer.name}
        className="aspect-video w-full rounded-xl border-0 bg-black"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLoaded(true)}
      className="group relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-border-strong bg-[radial-gradient(70%_90%_at_50%_40%,#21183a,#0d0d18)] text-center focus-ring"
    >
      <span className="grid size-14 place-items-center rounded-full bg-white/10 ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-110 group-hover:bg-white/15">
        <Play className="size-6 translate-x-0.5 fill-current" aria-hidden="true" />
      </span>
      <span className="px-4 text-sm font-medium">{trailer.name}</span>
      <span className="px-4 text-xs text-muted">Click to load the YouTube player</span>
    </button>
  );
}
