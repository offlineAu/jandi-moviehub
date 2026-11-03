import { describe, expect, it, vi } from 'vitest';
import { fetchBlenderFilms } from './blender-films.controller';

describe('creator-hosted open films', () => {
  it('accepts only the reviewed IDs on the creator channel and constructs fixed-host embeds', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const id = String(url).split('/').at(-1);
      return new Response(
        JSON.stringify({
          uuid: id,
          name: 'Verified film',
          duration: 888,
          privacy: { id: 1 },
          channel: { name: 'blender_open_movies', host: 'video.blender.org' },
        }),
      );
    });
    const result = await fetchBlenderFilms(fetcher as typeof fetch);
    expect(result.items).toHaveLength(5);
    expect(
      result.items.every((v) => v.embedUrl.startsWith('https://video.blender.org/videos/embed/')),
    ).toBe(true);
  });
  it('rejects an unexpected channel rather than treating its content as approved', async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify({
            uuid: String(url).split('/').at(-1),
            name: 'Video',
            duration: 20,
            privacy: { id: 1 },
            channel: { name: 'other', host: 'video.blender.org' },
          }),
        ),
    );
    await expect(fetchBlenderFilms(fetcher as typeof fetch)).rejects.toMatchObject({
      code: 'EXTERNAL_FILMS_UNAVAILABLE',
    });
  });
  it('keeps available films visible when one host response fails', async () => {
    let count = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      count++;
      if (count === 1) return new Response('', { status: 404 });
      return new Response(
        JSON.stringify({
          uuid: String(url).split('/').at(-1),
          name: 'Available',
          duration: 90,
          privacy: { id: 1 },
          channel: { name: 'blender_open_movies', host: 'video.blender.org' },
        }),
      );
    });
    const result = await fetchBlenderFilms(fetcher as typeof fetch);
    expect(result.items).toHaveLength(4);
    expect(result.unavailable).toBe(1);
  });
});
