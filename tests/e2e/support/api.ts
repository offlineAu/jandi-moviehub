import {
  request as pwRequest,
  type APIRequestContext,
  type BrowserContext,
  type Cookie,
} from '@playwright/test';

export const WEB = 'http://localhost:3400';
export const API = 'http://localhost:4400';
export const ORIGIN = WEB;

/** Short, unique, username-safe suffix (lowercase letters/digits). */
export function uniq(prefix = 'e2e'): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${rand}`.toLowerCase().slice(0, 24);
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  password: string;
  cookies: Cookie[];
}

export function newUserData(prefix = 'u') {
  const username = uniq(prefix);
  return {
    username,
    email: `${username}@e2e.test`,
    displayName: `QA ${username.slice(-6)}`,
    password: 'correct-horse-battery',
  };
}

async function apiContext(cookies: Cookie[] = []): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: ORIGIN },
    storageState: { cookies, origins: [] },
  });
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string) {
  if (!res.ok()) throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
}

/** Registers a brand-new account through the REST API and returns it with its session cookie. */
export async function registerUser(prefix = 'u'): Promise<TestUser> {
  const data = newUserData(prefix);
  const ctx = await apiContext();
  const res = await ctx.post('/api/v1/auth/register', { data });
  await expectOk(res, 'register');
  const { user } = (await res.json()) as { user: { id: string } };
  const { cookies } = await ctx.storageState();
  await ctx.dispose();
  return { ...data, id: user.id, cookies };
}

/** Logs an existing account in through the REST API (fresh session cookie). */
export async function apiLogin(user: Pick<TestUser, 'email' | 'password'>): Promise<Cookie[]> {
  const ctx = await apiContext();
  const res = await ctx.post('/api/v1/auth/login', {
    data: { email: user.email, password: user.password },
  });
  await expectOk(res, 'login');
  const { cookies } = await ctx.storageState();
  await ctx.dispose();
  return cookies;
}

/** Fast path: give a browser context the user's session (cookie domain `localhost`). */
export async function loginAs(context: BrowserContext, user: TestUser) {
  const cookies = await apiLogin(user);
  await context.addCookies(cookies.map((c) => ({ ...c, domain: 'localhost' })));
}

/** Authenticated JSON call as `user` against the API (Origin header set). */
export async function api<T = unknown>(
  user: TestUser | null,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<{ status: number; body: T }> {
  const ctx = await apiContext(user?.cookies ?? []);
  const res = await ctx.fetch(`/api/v1${path}`, { method, data });
  const text = await res.text();
  await ctx.dispose();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}

export async function apiOk<T = unknown>(
  user: TestUser | null,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<T> {
  const r = await api<T>(user, method, path, data);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export interface MovieSummary {
  id: string;
  title: string;
  playable: boolean;
}

let playableCache: MovieSummary[] | null = null;

/** The playable "Jandi Originals" (WebM demo media). */
export async function playableMovies(): Promise<MovieSummary[]> {
  if (playableCache) return playableCache;
  const body = await apiOk<{ items: MovieSummary[] }>(
    null,
    'GET',
    '/movies?playable=true&pageSize=20',
  );
  playableCache = body.items;
  return body.items;
}

export async function movieByTitle(re: RegExp): Promise<MovieSummary> {
  const m = (await playableMovies()).find((x) => re.test(x.title));
  if (!m) throw new Error(`No playable movie matching ${re}`);
  return m;
}

export interface RoomDto {
  id: string;
  code: string;
  name: string;
}

export async function createRoom(
  host: TestUser,
  opts: Partial<{
    name: string;
    visibility: 'PUBLIC' | 'PRIVATE' | 'PASSWORD' | 'FRIENDS';
    password: string;
    movieId: string;
    allowGuests: boolean;
    controlPolicy: 'HOST_ONLY' | 'HOSTS' | 'EVERYONE';
  }> = {},
): Promise<RoomDto> {
  const { room } = await apiOk<{ room: RoomDto }>(host, 'POST', '/rooms', {
    name: opts.name ?? `Room ${uniq('r')}`,
    visibility: opts.visibility ?? 'PUBLIC',
    ...opts,
  });
  return room;
}

export async function createInvite(host: TestUser, roomId: string): Promise<string> {
  const { invite } = await apiOk<{ invite: { token: string } }>(
    host,
    'POST',
    `/rooms/${roomId}/invites`,
    { expiresInHours: 1 },
  );
  return invite.token;
}

export async function joinRoom(user: TestUser, roomId: string, inviteToken?: string) {
  return apiOk(user, 'POST', `/rooms/${roomId}/join`, inviteToken ? { inviteToken } : {});
}

export interface PlaybackState {
  version: number;
  movieId: string | null;
  status: string;
  positionSec: number;
  anchorServerTime: number;
}

export async function playbackState(user: TestUser, roomId: string) {
  return apiOk<{ state: PlaybackState; serverTime: number }>(
    user,
    'GET',
    `/rooms/${roomId}/playback-state`,
  );
}

export async function devMail(to: string) {
  return apiOk<{ items: Array<{ subject: string; text: string }> }>(
    null,
    'GET',
    `/dev/mail?to=${encodeURIComponent(to)}`,
  );
}
