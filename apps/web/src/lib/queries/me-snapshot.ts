import type { QueryClient } from '@tanstack/react-query';
import type { Me } from '../types';
import { qk } from './keys';

/**
 * Last known signed-in user, kept in localStorage so the account UI can render right after
 * hydration instead of waiting for `/auth/me` (which can take a while when the API is cold).
 * It is only ever placeholder data: `/auth/me` still runs and its answer replaces it, and a
 * null answer (signed out / expired) clears it. Never trusted for authorization.
 */
const STORAGE_KEY = 'jandi:me-snapshot:v1';

function isMeLike(value: unknown): value is Me {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Me>;
  return (
    typeof v.id === 'string' && typeof v.username === 'string' && typeof v.isGuest === 'boolean'
  );
}

export function readMeSnapshot(): Me | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isMeLike(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeMeSnapshot(me: Me | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (me) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(me));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, quota): the UI just falls back to waiting for /auth/me.
  }
}

/** Mirrors every change to the `me` query (fetch, login, logout, profile edits) into storage. */
export function syncMeSnapshot(client: QueryClient): () => void {
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (event.query.queryHash !== JSON.stringify(qk.me)) return;
    const data = event.query.state.data as Me | null | undefined;
    if (data !== undefined) writeMeSnapshot(data);
  });
}
