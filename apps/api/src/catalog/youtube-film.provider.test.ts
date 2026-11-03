import { describe, expect, it, vi } from 'vitest';
import { fetchYouTubeFilms } from './youtube-film.provider';

const metadata = {
  title: 'Sita Sings the Blues',
  author_name: 'Question Copyright',
  provider_name: 'YouTube',
  type: 'video',
};

describe('filmmaker-linked YouTube film', () => {
  it('uses a fixed reviewed video and player host', async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request) => new Response(JSON.stringify(metadata)),
    );
    const result = await fetchYouTubeFilms(fetcher as typeof fetch);
    expect(result.items[0]).toMatchObject({
      id: 'youtube-RzTg7YXuy34',
      embedUrl: 'https://www.youtube-nocookie.com/embed/RzTg7YXuy34',
      provider: 'YouTube',
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('youtube.com/oembed');
  });
  it('rejects unexpected metadata', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ...metadata, author_name: 'Other' })),
    );
    await expect(fetchYouTubeFilms(fetcher as typeof fetch)).rejects.toMatchObject({
      code: 'EXTERNAL_FILMS_UNAVAILABLE',
    });
  });
  it('returns the FilmRise title even when another video is unavailable', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (!String(url).includes('Ekfn-RVo8XI')) return new Response('', { status: 404 });
      return new Response(
        JSON.stringify({
          title: 'Mortuary | Full Movie',
          author_name: 'FilmRise Movies',
          provider_name: 'YouTube',
          type: 'video',
        }),
      );
    });
    const result = await fetchYouTubeFilms(fetcher as typeof fetch);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/Ekfn-RVo8XI');
    expect(result.unavailable).toBe(1);
  });
});
