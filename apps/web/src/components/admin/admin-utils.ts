import type { UserRole } from '@jandi/shared';
import { errorMessage, isApiError } from '@/lib/api';
import type { AdminLicense, AuditEntry } from '@/lib/queries/admin';

/* ───────────────────────── Errors ───────────────────────── */

const ADMIN_ERRORS: Record<string, string> = {
  LAST_ADMIN:
    'At least one active administrator must remain. Promote someone else to admin before demoting or suspending this account.',
  SELF_MODIFICATION:
    'You can’t change your own role or suspend yourself. Ask another administrator.',
  GUEST_ROLE: 'Guest accounts can’t be given a platform role.',
  TMDB_MANAGED: 'This title is synced from TMDB and can’t be edited here.',
  LICENSE_NOT_VERIFIED:
    'This asset’s license isn’t verified or is outside its validity window. Verify the license first, then approve the asset.',
  MEDIA_FILE_MISSING:
    'No file exists at that storage key. Upload the video first or check the key.',
  INVALID_STORAGE_KEY:
    'That storage key isn’t allowed. Use a relative path such as uploads/<id>.webm (no leading slash or “..”).',
  UNSUPPORTED_MEDIA_TYPE:
    'That file isn’t a WebM or MP4 video. Only WebM and MP4 uploads are accepted.',
  FILE_REQUIRED: 'Choose a video file to upload.',
  PAYLOAD_TOO_LARGE: 'That file is larger than the 500 MB upload limit.',
  HTTP_413: 'That file is larger than the 500 MB upload limit.',
};

/** Friendly copy for admin error codes; falls back to the server's message. */
export function adminErrorMessage(error: unknown, fallback?: string): string {
  if (isApiError(error)) {
    const known =
      ADMIN_ERRORS[error.code] ?? (error.status === 413 ? ADMIN_ERRORS.HTTP_413 : undefined);
    if (known) return known;
    if (error.status === 403) return 'Your role doesn’t allow this action. The server refused it.';
  }
  return errorMessage(error, fallback);
}

/* ───────────────────────── Access ───────────────────────── */

export const ADMIN_SECTION_IDS = [
  'overview',
  'analytics',
  'users',
  'movies',
  'series',
  'sources',
  'licenses',
  'media',
  'rooms',
  'reports',
  'audit',
  'settings',
] as const;
export type AdminSectionId = (typeof ADMIN_SECTION_IDS)[number];

/** Sections moderators may use (mirrors the `mod` routes in docs/api/ADMIN.md). */
export const MODERATOR_SECTIONS: ReadonlySet<AdminSectionId> = new Set([
  'rooms',
  'reports',
  'audit',
]);

export function isStaff(role: UserRole | null | undefined): role is 'ADMIN' | 'MODERATOR' {
  return role === 'ADMIN' || role === 'MODERATOR';
}

export function canAccessSection(role: UserRole | null | undefined, section: AdminSectionId) {
  if (role === 'ADMIN') return true;
  if (role === 'MODERATOR') return MODERATOR_SECTIONS.has(section);
  return false;
}

/** Where a staff member lands on `/admin`. */
export function defaultSectionFor(role: 'ADMIN' | 'MODERATOR'): AdminSectionId {
  return role === 'ADMIN' ? 'overview' : 'reports';
}

/* ───────────────────────── Formatting ───────────────────────── */

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

/** 1,284 below 10K, then 12.9K / 4.2M. */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.abs(n) < 10_000 ? full.format(n) : compact.format(n);
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  return `${pct >= 99.95 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec) || totalSec < 0) return '—';
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 'YYYY-MM-DD' (UTC day bucket) → "Oct 24". */
export function formatDay(day: string, withYear = false): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Clean axis ticks from 0 to a rounded maximum (integers only — the series are counts). */
export function countTicks(max: number, target = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/* ───────────────────────── Licenses ───────────────────────── */

export type LicenseWindow = 'open' | 'active' | 'expired' | 'pending';

export interface LicenseStatus {
  verified: boolean;
  window: LicenseWindow;
  usable: boolean;
}

/** Validity is [validFrom, validUntil); null bounds are open. */
export function licenseWindow(
  license: Pick<AdminLicense, 'validFrom' | 'validUntil'>,
  now = Date.now(),
): LicenseWindow {
  const from = license.validFrom ? Date.parse(license.validFrom) : null;
  const until = license.validUntil ? Date.parse(license.validUntil) : null;
  if (from != null && now < from) return 'pending';
  if (until != null && now >= until) return 'expired';
  return from == null && until == null ? 'open' : 'active';
}

export function licenseStatus(
  license: Pick<AdminLicense, 'validFrom' | 'validUntil' | 'verified' | 'usable'>,
  now = Date.now(),
): LicenseStatus {
  return {
    verified: license.verified,
    window: licenseWindow(license, now),
    usable: license.usable,
  };
}

export const LICENSE_TYPE_LABELS: Record<string, string> = {
  PUBLIC_DOMAIN: 'Public domain',
  CREATIVE_COMMONS: 'Creative Commons',
  OWNED: 'Owned',
  LICENSED: 'Licensed',
  DEMO_GENERATED: 'Generated demo',
};

/** ISO → value for `<input type="datetime-local">` in the viewer's local time. */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value (local time) → ISO string, '' → null. Invalid → undefined. */
export function fromDatetimeLocal(value: string): string | null | undefined {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/* ───────────────────────── Movies ───────────────────────── */

/** "Drama, sci-fi ,, Drama" → ['Drama', 'sci-fi'] (case-insensitive de-dupe, order kept). */
export function parseGenres(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Keys whose values differ (shallow, arrays compared by JSON). */
export function changedKeys<T extends Record<string, unknown>>(
  next: T,
  previous: Partial<Record<keyof T, unknown>>,
): Array<keyof T> {
  return (Object.keys(next) as Array<keyof T>).filter(
    (key) => JSON.stringify(next[key] ?? null) !== JSON.stringify(previous[key] ?? null),
  );
}

/* ───────────────────────── Media ───────────────────────── */

export const MEDIA_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

/**
 * A quick client-side pre-check (extension / declared type). The server is the authority and
 * sniffs magic bytes; this only saves a pointless 500 MB upload of the wrong kind of file.
 */
export function checkVideoFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const typeOk = file.type === '' || file.type === 'video/webm' || file.type === 'video/mp4';
  if (!['webm', 'mp4', 'm4v'].includes(ext) || !typeOk)
    return 'Only WebM or MP4 video files can be uploaded.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MEDIA_UPLOAD_MAX_BYTES) return 'Videos can be at most 500 MB.';
  return null;
}

export const DEFAULT_MIME: Record<string, string> = {
  MP4: 'video/mp4',
  WEBM: 'video/webm',
  HLS: 'application/vnd.apple.mpegurl',
};

/* ───────────────────────── Audit log ───────────────────────── */

export const AUDIT_ACTION_PREFIXES = [
  { value: 'admin.user', label: 'Users' },
  { value: 'admin.movie', label: 'Movies' },
  { value: 'admin.license', label: 'Licenses' },
  { value: 'admin.media', label: 'Media assets' },
  { value: 'admin.room', label: 'Rooms' },
  { value: 'admin.message', label: 'Messages' },
  { value: 'admin.report', label: 'Reports' },
  { value: 'admin.setting', label: 'Settings' },
  { value: 'admin', label: 'All admin actions' },
  { value: 'auth', label: 'Account security' },
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none';
  if (typeof value === 'string') return `“${value.length > 60 ? `${value.slice(0, 57)}…` : value}”`;
  return String(value);
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One human-readable sentence (without the actor) for an audit row. */
export function describeAudit(
  entry: Pick<AuditEntry, 'action' | 'targetType' | 'metadata'>,
): string {
  const m = record(entry.metadata);
  const fields = Array.isArray(m.fields) ? (m.fields as unknown[]).map(String) : [];
  switch (entry.action) {
    case 'admin.user.update': {
      const changes = record(m.changes);
      const parts: string[] = [];
      const role = record(changes.role);
      if ('to' in role) parts.push(`changed role from ${show(role.from)} to ${show(role.to)}`);
      const suspended = record(changes.suspended);
      if ('to' in suspended)
        parts.push(suspended.to ? 'suspended the account' : 'lifted the suspension');
      if (typeof m.sessionsRevoked === 'number')
        parts.push(`revoked ${m.sessionsRevoked} session${m.sessionsRevoked === 1 ? '' : 's'}`);
      return parts.length ? `${list(parts)} of a user` : 'updated a user';
    }
    case 'admin.movie.create':
      return `created the movie ${show(m.title)}`;
    case 'admin.movie.update':
      return fields.length ? `edited a movie (${list(fields)})` : 'edited a movie';
    case 'admin.movie.delete':
      return `deleted the movie ${show(m.title)}`;
    case 'admin.license.create':
      return `created the license ${show(m.title)}`;
    case 'admin.license.update':
      return `edited a license${fields.length ? ` (${list(fields)})` : ''}${m.verificationCleared ? ' — verification cleared' : ''}`;
    case 'admin.license.verify':
      return 'verified a license';
    case 'admin.license.unverify':
      return 'removed the verification from a license';
    case 'admin.media.create':
      return `registered a ${String(m.format ?? 'media')} asset${m.storageKey ? ` (${String(m.storageKey)})` : ''}`;
    case 'admin.media.upload':
      return `uploaded a ${String(m.format ?? 'video')} file`;
    case 'admin.media.status':
      return `changed a media asset from ${show(m.from)} to ${show(m.to)}`;
    case 'admin.room.close':
      return 'closed a room';
    case 'admin.message.delete':
      return 'deleted a chat message';
    case 'admin.report.resolve': {
      const kind = typeof m.reportTargetType === 'string' ? m.reportTargetType.toLowerCase() : null;
      return `${m.to === 'DISMISSED' ? 'dismissed' : 'resolved'} a report${kind ? ` about a ${kind}` : ''}`;
    }
    case 'admin.setting.update':
      return `changed ${show(m.key)} from ${show(m.from)} to ${show(m.to)}`;
    case 'auth.password_changed':
      return 'changed their password';
    case 'auth.password_reset_requested':
      return 'requested a password reset';
    case 'auth.password_reset':
      return 'reset their password';
    case 'admin.bootstrap':
      return m.created
        ? 'created the first admin account'
        : 'was promoted to admin from the command line';
    default:
      return `${entry.action}${entry.targetType ? ` on ${entry.targetType}` : ''}`;
  }
}
