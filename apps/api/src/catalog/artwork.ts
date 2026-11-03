import { createHash } from 'node:crypto';

export const ARTWORK_ROUTE = '/api/v1/catalog/artwork';
export const ARTWORK_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(poster|backdrop)\.svg$/;
export type ArtworkKind = 'poster' | 'backdrop';

export const artworkUrl = (slug: string, kind: ArtworkKind) =>
  `${ARTWORK_ROUTE}/${slug}-${kind}.svg`;

export function escapeXml(value: string): string {
  return (
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

const PALETTES: Array<[string, string, string, string]> = [
  // [background-from, background-to, accent, text]
  ['#0f172a', '#312e81', '#f472b6', '#f8fafc'],
  ['#1c1917', '#7c2d12', '#fbbf24', '#fffbeb'],
  ['#052e16', '#155e75', '#a3e635', '#f0fdf4'],
  ['#2e1065', '#9d174d', '#38bdf8', '#fdf4ff'],
  ['#0c0a09', '#44403c', '#f97316', '#fafaf9'],
  ['#083344', '#1e3a8a', '#fde047', '#ecfeff'],
  ['#3f0d12', '#a71d31', '#f1d302', '#fff1f2'],
  ['#111827', '#065f46', '#fb7185', '#f9fafb'],
];

/** Greedy word wrap by approximate character width. */
export function wrapTitle(title: string, maxChars: number, maxLines = 4): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, Math.max(1, maxChars - 1))}…`;
    return kept;
  }
  return lines;
}

export interface ArtworkInput {
  slug: string;
  kind: ArtworkKind;
  title: string;
  year?: number | null;
  genres?: string[];
}

/**
 * Deterministic generated artwork (same input → byte-identical SVG). Its accessible name says it
 * is generated, and demo titles carry a "Demo" badge in the UI, so it is never mistaken for
 * official key art.
 */
export function renderArtwork({ slug, kind, title, year, genres = [] }: ArtworkInput): string {
  const hash = createHash('sha256').update(slug).digest();
  const [from, to, accent, ink] = PALETTES[hash[0]! % PALETTES.length]!;
  const poster = kind === 'poster';
  const w = poster ? 500 : 1280;
  const h = poster ? 750 : 720;

  const shapes: string[] = [];
  const count = 5 + (hash[1]! % 4);
  for (let i = 0; i < count; i++) {
    const b = (n: number) => hash[(2 + i * 4 + n) % hash.length]!;
    const cx = Math.round((b(0) / 255) * w);
    const cy = Math.round((b(1) / 255) * h * 0.7);
    const r = Math.round(((b(2) / 255) * 0.25 + 0.05) * Math.min(w, h));
    const opacity = (0.08 + (b(3) / 255) * 0.22).toFixed(2);
    shapes.push(
      i % 2 === 0
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" opacity="${opacity}"/>`
        : `<rect x="${cx - r}" y="${cy - r / 4}" width="${r * 2}" height="${Math.max(4, Math.round(r / 6))}" fill="${ink}" opacity="${opacity}" transform="rotate(${(b(3) % 60) - 30} ${cx} ${cy})"/>`,
    );
  }

  const fontSize = poster ? 46 : 72;
  const lines = wrapTitle(title, poster ? 16 : 26, poster ? 5 : 3);
  const titleBlockHeight = lines.length * fontSize * 1.1;
  const baseY = poster ? h - 150 - titleBlockHeight : h - 140 - titleBlockHeight;
  const x = poster ? 36 : 72;
  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${Math.round(baseY + (i + 1) * fontSize * 1.1)}" font-size="${fontSize}" font-weight="800" fill="${ink}">${escapeXml(line)}</text>`,
    )
    .join('');
  const meta = [year ? String(year) : null, genres.slice(0, 3).join(' · ') || null]
    .filter(Boolean)
    .join('  ·  ');
  const metaY = Math.round(baseY + titleBlockHeight + (poster ? 44 : 56));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(`Generated artwork for ${title}`)}">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="${poster ? '0.3' : '1'}" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`,
    `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></linearGradient></defs>`,
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>`,
    shapes.join(''),
    `<rect width="${w}" height="${h}" fill="url(#fade)"/>`,
    `<g font-family="Inter, 'Helvetica Neue', Arial, sans-serif">`,
    titleSvg,
    meta
      ? `<text x="${x}" y="${metaY}" font-size="${poster ? 22 : 30}" fill="${ink}" opacity="0.85">${escapeXml(meta)}</text>`
      : '',
    `</g></svg>`,
  ].join('');
}
