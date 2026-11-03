import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Relative artwork (generated SVGs served by the API) is not run through the image optimizer. */
function isRemoteOptimizable(src: string) {
  return src.startsWith('https://image.tmdb.org/');
}

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
      unoptimized={!isRemoteOptimizable(src)}
      className={cn('object-cover', className)}
    />
  );
}
