import { SESSION_COOKIE } from '@jandi/shared';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic auth gate: visitors without a session cookie are sent to /login for account areas.
 * The API remains the authority — pages still handle 401/403 (expired sessions, guests).
 */
export const PROTECTED_PREFIXES = [
  '/library',
  '/settings',
  '/watch',
  '/playlists',
  '/friends',
  '/notifications',
  '/admin',
] as const;

export function isProtectedPath(pathname: string): boolean {
  // TV metadata pages contain no media or account data; playback APIs remain authenticated.
  if (/^\/watch\/tv\/\d+\/season\/\d+\/episode\/\d+\/?$/.test(pathname)) return false;
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/library/:path*',
    '/settings/:path*',
    '/watch/:path*',
    '/playlists/:path*',
    '/friends/:path*',
    '/notifications/:path*',
    '/admin/:path*',
  ],
};
