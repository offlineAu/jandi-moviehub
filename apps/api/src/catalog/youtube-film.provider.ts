import { z } from 'zod';
import { Errors } from '../common/errors';

// Fixed, individually reviewed uploads; an arbitrary search hit is not proof of rights.
const approved = [
  {
    id: 'RzTg7YXuy34',
    title: 'Sita Sings the Blues',
    author: 'Question Copyright',
    creator: 'Nina Paley',
    licenseUrl: 'https://www.sitasingstheblues.com/license.html',
    attribution:
      'Nina Paley. Some songs have separate restrictions and may be heard in the original film; see the license.',
  },
  {
    id: 'Ekfn-RVo8XI',
    title: 'Mortuary | Full Movie',
    author: 'FilmRise Movies',
    creator: 'FilmRise Movies',
    licenseUrl: 'https://www.filmrise.com/about-us',
    attribution:
      'Presented by FilmRise Movies. Availability and ads are controlled by YouTube and the distributor.',
  },
] as const;

const oembed = z.object({
  title: z.string(),
  author_name: z.string(),
  provider_name: z.literal('YouTube'),
  type: z.literal('video'),
});

export async function fetchYouTubeFilms(fetcher: typeof fetch = fetch) {
  const results = await Promise.allSettled(
    approved.map(async (entry) => {
      const sourceUrl = `https://www.youtube.com/watch?v=${entry.id}`;
      const url = new URL('https://www.youtube.com/oembed');
      url.searchParams.set('url', sourceUrl);
      url.searchParams.set('format', 'json');
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      const parsed = oembed.safeParse(response.ok ? await response.json().catch(() => null) : null);
      if (
        !parsed.success ||
        parsed.data.title !== entry.title ||
        parsed.data.author_name !== entry.author
      )
        throw new Error('Unexpected video metadata');
      return {
        id: `youtube-${entry.id}`,
        title: parsed.data.title,
        durationSec: 0, // oEmbed does not provide a duration.
        embedUrl: `https://www.youtube-nocookie.com/embed/${entry.id}`,
        sourceUrl,
        licenseUrl: entry.licenseUrl,
        attribution: entry.attribution,
        provider: 'YouTube',
        creator: entry.creator,
      };
    }),
  );
  const items = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  if (!items.length)
    throw Errors.unavailable(
      'EXTERNAL_FILMS_UNAVAILABLE',
      'YouTube films are unavailable right now.',
    );
  return { items, unavailable: results.length - items.length };
}
