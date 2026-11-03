import { z } from 'zod';
import { Errors } from '../common/errors';

const responseSchema = z.object({
  query: z
    .object({
      pages: z
        .array(
          z.object({
            pageid: z.number().int().positive(),
            title: z.string(),
            imageinfo: z
              .array(
                z.object({
                  mime: z.string().optional(),
                  size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
                  duration: z.number().optional(),
                  extmetadata: z
                    .record(
                      z.string(),
                      z
                        .object({ value: z.union([z.string(), z.number()]).optional() })
                        .passthrough(),
                    )
                    .optional(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

/** Read-only discovery. Search results are candidates, never automatically approved assets. */
export async function searchCommons(query: string, fetcher: typeof fetch = fetch) {
  return fetchCommons(
    {
      generator: 'search',
      gsrsearch: `${query} filetype:video`,
      gsrnamespace: '6',
      gsrlimit: '12',
    },
    fetcher,
  );
}

export async function lookupCommons(pageId: number, fetcher: typeof fetch = fetch) {
  return (
    (await fetchCommons({ pageids: String(pageId) }, fetcher)).find((item) => item.id === pageId) ??
    null
  );
}

async function fetchCommons(extra: Record<string, string>, fetcher: typeof fetch) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  const params: Record<string, string> = {
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'mime|size|extmetadata',
    format: 'json',
    formatversion: '2',
    ...extra,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { 'User-Agent': 'JandiMovieHub/0.1 (source discovery)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
  } catch {
    throw Errors.unavailable('SOURCE_UNAVAILABLE', 'Wikimedia Commons is unavailable right now');
  }
  if (!response.ok)
    throw Errors.unavailable('SOURCE_UNAVAILABLE', 'Wikimedia Commons is unavailable right now');
  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    throw Errors.unavailable(
      'SOURCE_UNAVAILABLE',
      'Wikimedia Commons returned an invalid response',
    );
  const clean = (value: unknown) =>
    typeof value === 'string'
      ? value
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500)
      : '';
  return (parsed.data.query?.pages ?? [])
    .filter((p) => p.title.startsWith('File:') && p.imageinfo?.[0]?.mime?.startsWith('video/'))
    .map((p) => {
      const info = p.imageinfo![0]!;
      const metadata = info.extmetadata ?? {};
      return {
        id: p.pageid,
        title: p.title.replace(/^File:/, ''),
        sourceUrl: `https://commons.wikimedia.org/?curid=${p.pageid}`,
        mime: info.mime!,
        sizeBytes: info.size ?? null,
        license: clean(metadata.LicenseShortName?.value),
        artist: clean(metadata.Artist?.value),
        licenseUrl: clean(metadata.LicenseUrl?.value),
      };
    });
}
