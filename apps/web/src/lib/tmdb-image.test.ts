import { describe, expect, it } from 'vitest';
import { isTmdbImage, tmdbImageLoader, tmdbWidthFor } from './tmdb-image';

describe('tmdbImageLoader', () => {
  const src = 'https://image.tmdb.org/t/p/w500/abc.jpg';

  it('picks the smallest rendition that covers the requested width', () => {
    expect(tmdbWidthFor(16)).toBe(92);
    expect(tmdbWidthFor(256)).toBe(342);
    expect(tmdbWidthFor(342)).toBe(342);
    expect(tmdbWidthFor(640)).toBe(780);
  });

  it('accepts a rendition up to 15% narrower than the slot', () => {
    expect(tmdbWidthFor(400)).toBe(342);
    expect(tmdbWidthFor(588)).toBe(500);
    expect(tmdbWidthFor(589)).toBe(780);
  });

  it('caps at w1280 instead of the multi-megabyte original', () => {
    expect(tmdbWidthFor(3840)).toBe(1280);
  });

  it('rewrites only the size segment', () => {
    expect(tmdbImageLoader({ src, width: 384 })).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
    expect(tmdbImageLoader({ src, width: 500 })).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    expect(tmdbImageLoader({ src, width: 128 })).toBe('https://image.tmdb.org/t/p/w154/abc.jpg');
    expect(tmdbImageLoader({ src: 'https://image.tmdb.org/t/p/original/x.png', width: 1920 })).toBe(
      'https://image.tmdb.org/t/p/w1280/x.png',
    );
  });

  it('leaves non-TMDB sources untouched', () => {
    expect(isTmdbImage('/api/v1/catalog/artwork/a.svg')).toBe(false);
    expect(tmdbImageLoader({ src: '/api/v1/catalog/artwork/a.svg', width: 500 })).toBe(
      '/api/v1/catalog/artwork/a.svg',
    );
  });
});
