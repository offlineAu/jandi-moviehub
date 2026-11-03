import { HttpStatus, Logger } from '@nestjs/common';
import { AppError, Errors } from '../../common/errors';

export interface TmdbCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
}

export interface TmdbClientOptions {
  readToken?: string;
  apiKey?: string;
  cacheTtlSec: number;
  cache: TmdbCache;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export const upstreamUnavailable = (
  message = 'The movie database (TMDB) is not reachable right now. Try again shortly.',
) => new AppError(HttpStatus.BAD_GATEWAY, 'UPSTREAM_UNAVAILABLE', message);

/**
 * Thin TMDB v3 HTTP client: bearer token (preferred) or `api_key` query auth, request timeout,
 * Redis-backed response cache and mapping of upstream failures to `502 UPSTREAM_UNAVAILABLE`.
 * Credentials are never logged.
 */
export class TmdbClient {
  private readonly logger = new Logger('TmdbClient');
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: TmdbClientOptions) {
    if (!options.readToken && !options.apiKey) throw new Error('TMDB credentials missing');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.themoviedb.org/3';
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  static cacheKey(path: string, params: Record<string, string | number | undefined>): string {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&');
    return `tmdb:v1:${path}?${query}`;
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const key = TmdbClient.cacheKey(path, params);
    const cached = await this.options.cache.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as T;

    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.options.readToken) headers.authorization = `Bearer ${this.options.readToken}`;
    else url.searchParams.set('api_key', this.options.apiKey!);

    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network error';
      this.logger.warn(`TMDB ${path} failed: ${reason}`);
      throw upstreamUnavailable();
    }
    if (res.status === 404) throw Errors.notFound('Movie');
    if (!res.ok) {
      this.logger.warn(`TMDB ${path} responded ${res.status}`);
      if (res.status === 401)
        throw upstreamUnavailable('The movie database rejected our credentials.');
      if (res.status === 429)
        throw upstreamUnavailable('The movie database is rate limiting us. Try again shortly.');
      throw upstreamUnavailable();
    }
    let body: T;
    try {
      body = (await res.json()) as T;
    } catch {
      throw upstreamUnavailable('The movie database returned an unreadable response.');
    }
    await this.options.cache
      .set(key, JSON.stringify(body), this.options.cacheTtlSec)
      .catch(() => undefined);
    return body;
  }
}
