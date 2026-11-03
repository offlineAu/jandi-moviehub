export const API_PREFIX = '/api/v1';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;
  readonly retryAfterSec: number | undefined;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
    retryAfterSec?: number;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
    this.retryAfterSec = init.retryAfterSec;
  }

  /** `VALIDATION_FAILED.details` normalised to `{ field: message }` (first message per field). */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (!Array.isArray(this.details)) return out;
    for (const entry of this.details as unknown[]) {
      if (!entry || typeof entry !== 'object') continue;
      const { path, message } = entry as { path?: unknown; message?: unknown };
      const key = Array.isArray(path) ? path.join('.') : typeof path === 'string' ? path : '';
      if (key && typeof message === 'string' && !(key in out)) out[key] = message;
    }
    return out;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (isApiError(error)) {
    if (error.code === 'NETWORK_ERROR')
      return 'Can’t reach Jandi right now. Check your connection and try again.';
    if (error.code === 'RATE_LIMITED') {
      return error.retryAfterSec
        ? `Too many attempts. Try again in ${error.retryAfterSec} seconds.`
        : 'Too many attempts. Wait a moment and try again.';
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type JsonBody = Record<string, unknown> | unknown[];

export type ApiInit = Omit<RequestInit, 'body'> & {
  body?: BodyInit | JsonBody | null;
  /** Query string parameters; undefined/null/'' values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
};

function isJsonBody(body: unknown): body is JsonBody {
  if (body == null || typeof body !== 'object') return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return false;
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return false;
  return true;
}

export function buildApiUrl(path: string, query?: ApiInit['query']): string {
  const normalised = path.startsWith('/api/')
    ? path
    : `${API_PREFIX}${path.startsWith('/') ? '' : '/'}${path}`;
  // On the server there is no same-origin rewrite; talk to the API directly.
  const base =
    typeof window === 'undefined'
      ? (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '')
      : '';
  let url = `${base}${normalised}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  return url;
}

export async function parseApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    const text = await response.text();
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  const body = (payload && typeof payload === 'object' ? payload : {}) as {
    error?: { code?: unknown; message?: unknown; details?: unknown };
    requestId?: unknown;
  };
  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiError({
    status: response.status,
    code: typeof body.error?.code === 'string' ? body.error.code : `HTTP_${response.status}`,
    message:
      typeof body.error?.message === 'string' && body.error.message
        ? body.error.message
        : response.statusText || `Request failed (${response.status})`,
    details: body.error?.details,
    requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
    retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

/**
 * Fetch a JSON endpoint of the Jandi API. Paths are relative to `/api/v1` and go through the
 * Next.js rewrite (same origin) so the HttpOnly session cookie is sent.
 * Throws `ApiError` for non-2xx responses and network failures. Resolves `undefined` for 204.
 */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, query, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has('Accept')) finalHeaders.set('Accept', 'application/json');
  let finalBody: BodyInit | null | undefined;
  if (isJsonBody(body)) {
    finalHeaders.set('Content-Type', 'application/json');
    finalBody = JSON.stringify(body);
  } else {
    finalBody = body as BodyInit | null | undefined;
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, query), {
      credentials: 'same-origin',
      ...rest,
      headers: finalHeaders,
      body: finalBody,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network request failed' });
  }

  if (!response.ok) throw await parseApiError(response);
  if (response.status === 204 || response.status === 202) {
    // 202 may carry a body; read it if present.
    const text = await response.text().catch(() => '');
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
