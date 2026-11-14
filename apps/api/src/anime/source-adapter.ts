import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { get } from 'node:https';
import { z } from 'zod';

export const adapterConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    family: z.string().regex(/^[a-z0-9-]{1,40}$/),
    baseUrl: z.url(),
    mediaHosts: z
      .array(z.string().regex(/^[a-z0-9.-]+$/))
      .min(1)
      .max(40),
    enabled: z.boolean().default(false),
  })
  .strict();
export type AdapterConfig = z.infer<typeof adapterConfigSchema>;
export interface SourceCandidate {
  url: string;
  format: 'HLS' | 'MP4';
  mimeType: string;
  label: string;
  captions: Array<{ lang: string; label: string; url: string }>;
}
const streamsSchema = z.object({
  streams: z
    .array(
      z.object({
        name: z.string().max(300).optional(),
        url: z.string().max(8192).optional(),
        infoHash: z.string().optional(),
        externalUrl: z.string().optional(),
        behaviorHints: z.object({ proxyHeaders: z.unknown().optional() }).optional(),
        subtitles: z
          .array(z.object({ lang: z.string().regex(/^[a-z]{2,3}$/i), url: z.string().max(8192) }))
          .max(50)
          .optional(),
      }),
    )
    .max(100),
});

export function publicAddress(address: string): boolean {
  // Reject special-use IPv4 and IPv6. IPv4-mapped IPv6 is rejected in full.
  if (isIP(address) === 6)
    return /^2[0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number) as [number, number];
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}
export function secureUrl(value: string, hosts?: string[]): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    isIP(url.hostname) ||
    url.hostname === 'localhost' ||
    !url.hostname.includes('.') ||
    (hosts && !hosts.includes(url.hostname))
  )
    throw new Error('Unapproved origin');
  return url;
}
export async function readJson(response: Response, limit = 256_000): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Upstream unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Response too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function normalizeStreams(payload: unknown, config: AdapterConfig): SourceCandidate[] {
  const result: SourceCandidate[] = [];
  for (const stream of streamsSchema.parse(payload).streams) {
    if (!stream.url || stream.infoHash || stream.externalUrl || stream.behaviorHints?.proxyHeaders)
      continue;
    try {
      const url = secureUrl(stream.url, config.mediaHosts);
      const format = /\.m3u8$/i.test(url.pathname)
        ? 'HLS'
        : /\.mp4$/i.test(url.pathname)
          ? 'MP4'
          : null;
      if (!format) continue;
      const captions = (stream.subtitles ?? []).flatMap((track) => {
        try {
          const caption = secureUrl(track.url, config.mediaHosts);
          // Browser text tracks require WebVTT. Do not advertise SRT as VTT.
          if (!/\.vtt$/i.test(caption.pathname)) return [];
          return [
            {
              lang: track.lang,
              label: track.lang.toLowerCase() === 'en' ? 'English' : track.lang.toUpperCase(),
              url: caption.href,
            },
          ];
        } catch {
          return [];
        }
      });
      result.push({
        url: url.href,
        format,
        mimeType: format === 'HLS' ? 'application/vnd.apple.mpegurl' : 'video/mp4',
        label: stream.name ?? config.id,
        captions,
      });
    } catch {
      /* Unsupported sources are not browser candidates. */
    }
  }
  return result.slice(0, 10);
}
export async function resolveStreams(
  config: AdapterConfig,
  type: 'movie' | 'series',
  id: string,
  signal: AbortSignal,
) {
  const base = secureUrl(config.baseUrl);
  if (base.search) throw new Error('Invalid resolver configuration');
  const addresses = await lookup(base.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new Error('Unapproved resolver');
  // Pin the checked DNS address for this request; never re-resolve after validation.
  const address = addresses[0]!;
  const payload = await new Promise<unknown>((resolve, reject) => {
    const request = get(
      `${base.href.replace(/\/$/, '')}/stream/${type}/${encodeURIComponent(id)}.json`,
      {
        signal,
        hostname: address.address,
        servername: base.hostname,
        headers: { Accept: 'application/json', Host: base.host },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.destroy();
          reject(new Error('Upstream unavailable'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (part: Buffer) => {
          size += part.length;
          if (size > 256000) {
            response.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(part);
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(new Error('Invalid response'));
          }
        });
      },
    );
    request.on('error', reject);
  });
  return normalizeStreams(payload, config);
}
