'use client';

import Image from 'next/image';
import { tmdbImageLoader, isTmdbImage } from '@/lib/tmdb-image';
import { cn } from '@/lib/utils';

export function Artwork({
  src,
  alt,
  sizes,
  priority,
  className,
  fallbackTitle,
  kind = 'poster',
}: {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** When there is no artwork, the title is set typographically instead. */
  fallbackTitle?: string;
  kind?: 'poster' | 'backdrop' | 'profile';
}) {
  if (!src) {
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        className={cn(
          'absolute inset-0 flex items-end bg-[radial-gradient(120%_80%_at_20%_0%,#2a1745_0%,#141422_55%,#0c0c16_100%)] p-3',
          className,
        )}
      >
        {fallbackTitle ? (
          <span
            aria-hidden="true"
            className={cn(
              'font-display font-semibold leading-tight text-white/80',
              kind === 'backdrop' ? 'text-3xl' : 'line-clamp-4 text-base',
            )}
          >
            {fallbackTitle}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      // TMDB artwork is served at the closest pre-sized rendition straight from TMDB's CDN —
      // routing it through the Next optimizer cost 250–1200ms per uncached image.
      // Other artwork (generated SVGs served by the API) is used as-is.
      loader={isTmdbImage(src) ? tmdbImageLoader : undefined}
      unoptimized={!isTmdbImage(src)}
      className={cn('object-cover', className)}
    />
  );
}
