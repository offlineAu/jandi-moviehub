import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Only allow same-site relative paths for `?next=` style redirects. */
export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.startsWith('/\\'))
    return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return fallback;
  try {
    const url = new URL(decoded, 'http://same.origin');
    if (url.origin !== 'http://same.origin') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatRating(vote: number | null | undefined): string | null {
  if (vote == null || Number.isNaN(vote) || vote <= 0) return null;
  return vote.toFixed(1);
}

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return relativeFormatter.format(diffSec, 'second');
  if (abs < 3600) return relativeFormatter.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return relativeFormatter.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return relativeFormatter.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 365)
    return relativeFormatter.format(Math.round(diffSec / (86400 * 30)), 'month');
  return relativeFormatter.format(Math.round(diffSec / (86400 * 365)), 'year');
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
      : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}
