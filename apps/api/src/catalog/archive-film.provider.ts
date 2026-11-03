import { z } from 'zod';
import { Errors } from '../common/errors';

// The filmmaker links this exact Archive item from her official watch page. Other
// Archive uploads are not automatically licensed or approved for playback.
const itemId = 'Sita_Sings_the_Blues';
const metadata = z.object({
  metadata: z.object({
    identifier: z.literal(itemId),
    title: z.literal('Sita Sings the Blues'),
    creator: z.literal('Nina Paley'),
    mediatype: z.literal('movies'),
  }),
  files: z.array(z.object({ name: z.string(), length: z.string().optional() })),
});

export async function fetchArchiveFilms(fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher(`https://archive.org/metadata/${itemId}`, {
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw Errors.unavailable('EXTERNAL_FILMS_UNAVAILABLE', 'Internet Archive is unavailable.');
  }
  const parsed = metadata.safeParse(response.ok ? await response.json().catch(() => null) : null);
  const film = parsed.success
    ? parsed.data.files.find((file) => file.name === 'Sita_Sings_the_Blues.mp4')
    : undefined;
  const durationSec = Number(film?.length);
  if (!film || !Number.isFinite(durationSec) || durationSec <= 0)
    throw Errors.unavailable(
      'EXTERNAL_FILMS_UNAVAILABLE',
      'The Archive film could not be verified.',
    );
  return {
    items: [
      {
        id: itemId,
        title: 'Sita Sings the Blues',
        durationSec,
        embedUrl: `https://archive.org/embed/${itemId}`,
        sourceUrl: `https://archive.org/details/${itemId}`,
        licenseUrl: 'https://www.sitasingstheblues.com/license.html',
        attribution:
          'Nina Paley. The film is offered under CC0; some songs have separate restrictions and may be heard in the original film. See the license.',
        provider: 'Internet Archive',
        creator: 'Nina Paley',
      },
    ],
    unavailable: 0,
  };
}
