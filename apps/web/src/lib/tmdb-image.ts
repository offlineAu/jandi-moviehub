import type { ImageLoaderProps } from 'next/image';

const TMDB_PREFIX = 'https://image.tmdb.org/t/p/';

/**
 * Pre-sized renditions TMDB serves for any image (posters, backdrops, profiles, stills).
 * Capped at w1280: `original` files run to ~1MB, far more than any slot here needs.
 */
const TMDB_WIDTHS = [92, 154, 185, 342, 500, 780, 1280] as const;
const TMDB_MAX_WIDTH = 1280;

export function isTmdbImage(src: string): boolean {
  return src.startsWith(TMDB_PREFIX);
}

/**
 * A rendition up to this much narrower than the slot is still used: the upscale is not visible and
 * saves a step up in bytes. (It also keeps 400px — the width Next's dev check probes a custom
 * loader with — off w500, the size the API emits posters at, so that check sees a resized URL.)
 */
const UPSCALE_TOLERANCE = 0.85;

/** Smallest TMDB rendition that covers `width` (within tolerance); the largest if none does. */
export function tmdbWidthFor(width: number): number {
  return TMDB_WIDTHS.find((w) => w >= width * UPSCALE_TOLERANCE) ?? TMDB_MAX_WIDTH;
}

/**
 * next/image loader that points each srcset candidate at TMDB's CDN directly, swapping the
 * size segment of `https://image.tmdb.org/t/p/<size>/<file>`.
 */
export function tmdbImageLoader({ src, width }: ImageLoaderProps): string {
  const rest = src.slice(TMDB_PREFIX.length);
  const slash = rest.indexOf('/');
  if (!isTmdbImage(src) || slash < 0) return src;
  return `${TMDB_PREFIX}w${tmdbWidthFor(width)}${rest.slice(slash)}`;
}
