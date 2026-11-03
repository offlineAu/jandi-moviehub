import { z } from 'zod';
import { Errors } from '../../common/errors';

const rowSchema = z.object({
  name: z.string(),
  type: z.string(),
  region: z.string(),
  web_url: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).nullable().optional(),
});
export interface AvailabilityCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
}
export class WatchmodeProvider {
  constructor(
    private readonly apiKey: string,
    private readonly cache: AvailabilityCache,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async sources(kind: 'tv' | 'movie', id: number, region: string) {
    const key = `watchmode:v1:${kind}:${id}:${region}`;
    const cached = await this.cache.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as ReturnType<typeof this.mapRows>;
    const url = new URL(`https://api.watchmode.com/v1/title/${kind}-${id}/sources/`);
    url.searchParams.set('regions', region);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { 'X-API-Key': this.apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
    } catch {
      throw Errors.unavailable(
        'AVAILABILITY_UNAVAILABLE',
        'Availability could not be loaded. Try again later.',
      );
    }
    if (!response.ok)
      throw Errors.unavailable(
        'AVAILABILITY_UNAVAILABLE',
        'Availability is unavailable for this region or account.',
      );
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw Errors.unavailable('AVAILABILITY_UNAVAILABLE', 'Availability data could not be read.');
    }
    const parsed = z.array(rowSchema).safeParse(raw);
    if (!parsed.success)
      throw Errors.unavailable(
        'AVAILABILITY_UNAVAILABLE',
        'Availability data has an unexpected format.',
      );
    const items = this.mapRows(parsed.data.filter((item) => item.region.toUpperCase() === region));
    await this.cache.set(key, JSON.stringify(items), 3600).catch(() => undefined);
    return items;
  }
  private mapRows(rows: z.infer<typeof rowSchema>[]) {
    return rows.map((item) => {
      let url: string | null = null;
      try {
        const parsed = new URL(item.web_url ?? '');
        if (
          parsed.protocol === 'https:' &&
          !parsed.username &&
          !parsed.password &&
          parsed.hostname.includes('.') &&
          !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) &&
          !parsed.hostname.endsWith('.localhost')
        )
          url = parsed.href;
      } catch {
        /* No valid web destination supplied. */
      }
      return {
        provider: item.name,
        type: item.type,
        region: item.region,
        price: item.price ?? null,
        url,
      };
    });
  }
}
