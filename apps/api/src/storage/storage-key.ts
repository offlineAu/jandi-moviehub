import { isAbsolute, relative, resolve, sep } from 'node:path';

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Thrown for keys that are malformed or try to escape the storage root. */
export class UnsafeStorageKeyError extends Error {
  constructor(message = 'Invalid storage key') {
    super(message);
    this.name = 'UnsafeStorageKeyError';
  }
}

/**
 * Validates an object key: relative, `/`-separated, no empty / `.` / `..` segments,
 * only `[A-Za-z0-9._-]` characters per segment. Returns the key unchanged.
 */
export function assertSafeKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 500)
    throw new UnsafeStorageKeyError();
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0'))
    throw new UnsafeStorageKeyError();
  for (const segment of key.split('/')) {
    if (segment === '' || segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment)) {
      throw new UnsafeStorageKeyError();
    }
  }
  return key;
}

export function isSafeKey(key: string): boolean {
  try {
    assertSafeKey(key);
    return true;
  } catch {
    return false;
  }
}

/** Resolves a key to an absolute path, guaranteeing the result stays inside `root`. */
export function resolveInside(root: string, key: string): string {
  assertSafeKey(key);
  const base = resolve(root);
  const full = resolve(base, ...key.split('/'));
  const rel = relative(base, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
    throw new UnsafeStorageKeyError();
  }
  return full;
}
