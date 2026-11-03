import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, buildApiUrl, errorMessage } from './api';

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('prefixes paths, sends JSON with same-origin credentials and parses the body', async () => {
    const fetchMock = mockFetch(json(200, { user: { id: '1' } }));
    const result = await apiFetch<{ user: { id: string } }>('/auth/login', {
      method: 'POST',
      body: { email: 'a@b.co' },
    });
    expect(result.user.id).toBe('1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/login');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe('{"email":"a@b.co"}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('resolves undefined for 204 responses', async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('maps the standard error body to a typed ApiError with field errors', async () => {
    mockFetch(
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: [
            { path: 'password', message: 'Password must be at least 10 characters' },
            { path: ['profile', 'bio'], message: 'Too long' },
          ],
        },
        requestId: 'req-1',
      }),
    );
    const error = await apiFetch('/auth/register', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe('VALIDATION_FAILED');
    expect(apiError.requestId).toBe('req-1');
    expect(apiError.fieldErrors).toEqual({
      password: 'Password must be at least 10 characters',
      'profile.bio': 'Too long',
    });
  });

  it('reads Retry-After for rate limits and handles non-JSON errors', async () => {
    mockFetch(
      json(429, { error: { code: 'RATE_LIMITED', message: 'Slow down' } }, { 'Retry-After': '30' }),
    );
    const limited = (await apiFetch('/auth/login').catch((e: unknown) => e)) as ApiError;
    expect(limited.retryAfterSec).toBe(30);
    expect(errorMessage(limited)).toBe('Too many attempts. Try again in 30 seconds.');

    mockFetch(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    const gateway = (await apiFetch('/movies').catch((e: unknown) => e)) as ApiError;
    expect(gateway.code).toBe('HTTP_502');
    expect(gateway.message).toBe('Bad Gateway');
  });

  it('turns network failures into NETWORK_ERROR', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const error = (await apiFetch('/movies').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
  });

  it('builds query strings and skips empty values', () => {
    expect(buildApiUrl('/movies', { q: 'neon', page: 2, genre: undefined, playable: '' })).toBe(
      '/api/v1/movies?q=neon&page=2',
    );
  });
});
