import { extname } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.m4s': 'video/iso.segment',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.aac': 'audio/aac',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'application/x-subrip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export type RangeResult =
  { kind: 'none' } | { kind: 'range'; start: number; end: number } | { kind: 'unsatisfiable' };

/**
 * Parses a single `Range: bytes=…` header against a resource of `size` bytes.
 * Multi-range requests and malformed headers fall back to the full resource (RFC 9110 allows ignoring Range).
 */
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { kind: 'none' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: 'none' };
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return { kind: 'none' };
  let start: number;
  let end: number;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (suffix === 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
    if (rawEnd !== '' && Number(rawEnd) < start) return { kind: 'none' };
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || size === 0) {
    return { kind: 'unsatisfiable' };
  }
  return { kind: 'range', start, end };
}
