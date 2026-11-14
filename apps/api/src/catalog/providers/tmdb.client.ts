import { HttpStatus, Logger } from '@nestjs/common';
import { AppError, Errors } from '../../common/errors';

export interface TmdbCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
}

export interface TmdbClientOptions {
  readToken?: string;
  apiKey?: string;
  /** How long a response is fresh. */
  cacheTtlSec: number;
  /**
   * How long past `cacheTtlSec` a response may still be served while it is refreshed in the
   * background (stale-while-revalidate). Default 24h; 0 disables.
   */
  staleTtlSec?: number;
  cache: TmdbCache;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export const upstreamUnavailable = (
  message = 'The movie database (TMDB) is not reachable right now. Try again shortly.',
) => new AppError(HttpStatus.BAD_GATEWAY, 'UPSTREAM_UNAVAILABLE', message);

/** Cached response plus when it was fetched (epoch ms), so freshness is known on read. */
interface CacheEntry {
  at: number;
  body: unknown;
}

/**
 * Thin TMDB v3 HTTP client: bearer token (preferred) or `api_key` query auth, request timeout,
 * Redis-backed stale-while-revalidate response cache and mapping of upstream failures to
 * `502 UPSTREAM_UNAVAILABLE`. Credentials are never logged.
 *
 * Fresh entries are served from cache. Stale entries (past `cacheTtlSec`, within `staleTtlSec`)
 * are served immediately while one background request refreshes them, so callers only wait on
 * TMDB when nothing usable is cached. Concurrent requests for the same uncached key share one
 * upstream call.
 */
export class TmdbClient {
  private readonly logger = new Logger('TmdbClient');
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly staleTtlSec: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly options: TmdbClientOptions) {
    if (!options.readToken && !options.apiKey) throw new Error('TMDB credentials missing');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.themoviedb.org/3';
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.staleTtlSec = options.staleTtlSec ?? 24 * 3600;
  }

  static cacheKey(path: string, params: Record<string, string | number | undefined>): string {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&');
    return `tmdb:v2:${path}?${query}`;
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const key = TmdbClient.cacheKey(path, params);
    const entry = await this.readCache(key);
    if (entry) {
      if (Date.now() - entry.at >= this.options.cacheTtlSec * 1000) {
        this.fetchShared(key, path, params).catch((error: unknown) => {
          const reason = error instanceof AppError ? error.code : 'error';
          this.logger.warn(`TMDB background refresh of ${path} failed (${reason}); serving stale`);
        });
      }
      return entry.body as T;
    }
    return (await this.fetchShared(key, path, params)) as T;
  }

  private async readCache(key: string): Promise<CacheEntry | null> {
    const raw = await this.options.cache.get(key).catch(() => null);
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as Partial<CacheEntry>;
      return typeof entry.at === 'number' && 'body' in entry ? (entry as CacheEntry) : null;
    } catch {
      return null;
    }
  }

  /** One upstream request per key at a time; concurrent callers share its result. */
  private fetchShared(
    key: string,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<unknown> {
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.fetchAndStore(key, path, params).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    return pending;
  }

  private async fetchAndStore(
    key: string,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<unknown> {
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
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw upstreamUnavailable('The movie database returned an unreadable response.');
    }
    const entry: CacheEntry = { at: Date.now(), body };
    await this.options.cache
      .set(key, JSON.stringify(entry), this.options.cacheTtlSec + this.staleTtlSec)
      .catch(() => undefined);
    return body;
  }
}
