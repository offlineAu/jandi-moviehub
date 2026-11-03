import { describe, expect, it } from 'vitest';
import { ARTWORK_FILE, escapeXml, renderArtwork, wrapTitle } from './artwork';

describe('artwork', () => {
  it('is deterministic and labelled as generated', () => {
    const a = renderArtwork({
      slug: 'neon-drift',
      kind: 'poster',
      title: 'Neon Drift',
      year: 2026,
      genres: ['Sci-Fi'],
    });
    const b = renderArtwork({
      slug: 'neon-drift',
      kind: 'poster',
      title: 'Neon Drift',
      year: 2026,
      genres: ['Sci-Fi'],
    });
    expect(a).toBe(b);
    expect(a).toContain('Generated artwork for Neon Drift');
    expect(a).not.toContain('DEMO ART');
    expect(a.startsWith('<svg')).toBe(true);
  });

  it('escapes XML in titles', () => {
    const svg = renderArtwork({
      slug: 'x',
      kind: 'backdrop',
      title: '<script>alert("x")</script> & Co',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(escapeXml(`a&b<c>"d"'e`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e');
  });

  it('wraps long titles and validates file names', () => {
    expect(wrapTitle('The Last Projectionist Returns Again', 16)).toEqual([
      'The Last',
      'Projectionist',
      'Returns Again',
    ]);
    expect(ARTWORK_FILE.test('neon-drift-poster.svg')).toBe(true);
    expect(ARTWORK_FILE.test('../etc-poster.svg')).toBe(false);
    expect(ARTWORK_FILE.test('neon-drift-thumb.svg')).toBe(false);
  });
});
