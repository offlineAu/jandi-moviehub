import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, RateLimit } from '../common/auth-context';
import { Errors } from '../common/errors';
import { fetchArchiveFilms } from './archive-film.provider';
import { fetchYouTubeFilms } from './youtube-film.provider';

// Each exact creator-hosted film is individually reviewed; do not promote arbitrary search results.
const approved = [
  {
    id: '0eb052d0-fd51-43e6-aa33-ecdbf77a5d40',
    licenseUrl: 'https://durian.blender.org/sharing/',
    attribution: '© Blender Foundation. CC BY 3.0. Include the complete film credits.',
  },
  {
    id: 'bf1f3fb5-b119-4f9f-9930-8e20e892b898',
    licenseUrl: 'https://peach.blender.org/about/',
    attribution: '© Blender Foundation. CC BY 3.0. Include the complete film credits.',
  },
  {
    id: 'cccc3e60-0291-4ecc-aa56-39b2e2c7d0d5',
    licenseUrl: 'https://orange.blender.org/page/2/',
    attribution:
      '© Blender Foundation / Netherlands Media Art Institute. CC BY 2.5. Include the complete film credits.',
  },
  {
    id: '8533ea43-4271-4a57-9694-e9d0b35e1aa1',
    licenseUrl: 'https://mango.blender.org/about/',
    attribution: '© Blender Foundation. CC BY 3.0. Include the complete film credits.',
  },
  {
    id: 'f507dfdc-e73e-45a4-9778-d758cbe1ce96',
    licenseUrl: 'https://gooseberry.blender.org/about/',
    attribution: '© Blender Foundation | gooseberry.blender.org. CC BY 3.0.',
  },
] as const;
const video = z.object({
  uuid: z.uuid(),
  name: z.string().min(1).max(300),
  duration: z.number().nonnegative(),
  channel: z.object({
    name: z.literal('blender_open_movies'),
    host: z.literal('video.blender.org'),
  }),
  privacy: z.object({ id: z.literal(1) }),
});
export async function fetchBlenderFilms(fetcher: typeof fetch = fetch) {
  const entries = await Promise.allSettled(
    approved.map(async (entry) => {
      let response: Response;
      try {
        response = await fetcher(`https://video.blender.org/api/v1/videos/${entry.id}`, {
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
          headers: { Accept: 'application/json' },
        });
      } catch {
        throw Errors.unavailable(
          'EXTERNAL_FILMS_UNAVAILABLE',
          'Blender videos are unavailable right now.',
        );
      }
      if (!response.ok)
        throw Errors.unavailable(
          'EXTERNAL_FILMS_UNAVAILABLE',
          'Blender videos are unavailable right now.',
        );
      const parsed = video.safeParse(await response.json().catch(() => null));
      if (!parsed.success || parsed.data.uuid !== entry.id)
        throw Errors.unavailable(
          'EXTERNAL_FILMS_UNAVAILABLE',
          'The video source could not be verified.',
        );
      return {
        id: entry.id,
        title: parsed.data.name,
        durationSec: parsed.data.duration,
        embedUrl: `https://video.blender.org/videos/embed/${entry.id}`,
        sourceUrl: `https://video.blender.org/videos/watch/${entry.id}`,
        licenseUrl: entry.licenseUrl,
        attribution: entry.attribution,
        provider: 'Blender Video',
        creator: 'Blender Foundation',
      };
    }),
  );
  const items = entries.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value);
  if (!items.length)
    throw Errors.unavailable(
      'EXTERNAL_FILMS_UNAVAILABLE',
      'Blender videos are unavailable right now.',
    );
  return { items, unavailable: entries.length - items.length };
}
export async function fetchExternalFilms(
  providers = [fetchBlenderFilms, fetchArchiveFilms, fetchYouTubeFilms],
) {
  const results = await Promise.allSettled(providers.map((provider) => provider()));
  const available = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  if (!available.length)
    throw Errors.unavailable(
      'EXTERNAL_FILMS_UNAVAILABLE',
      'Film sources are unavailable right now.',
    );
  return {
    items: available.flatMap((result) => result.items),
    unavailable:
      available.reduce((sum, result) => sum + result.unavailable, 0) +
      results.length -
      available.length,
  };
}
@ApiTags('external films')
@Controller('external-films')
export class BlenderFilmsController {
  @Public()
  @RateLimit({ name: 'external-films', limit: 60, windowSec: 60 })
  @Get()
  list() {
    return fetchExternalFilms();
  }
}
