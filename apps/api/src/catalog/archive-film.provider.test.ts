import { describe, expect, it, vi } from 'vitest';
import { fetchArchiveFilms } from './archive-film.provider';
import { fetchExternalFilms } from './blender-films.controller';

const archiveRecord = {
  metadata: {
    identifier: 'Sita_Sings_the_Blues',
    title: 'Sita Sings the Blues',
    creator: 'Nina Paley',
    mediatype: 'movies',
  },
  files: [{ name: 'Sita_Sings_the_Blues.mp4', length: '4891.24' }],
};

describe('approved Internet Archive film', () => {
  it('returns the reviewed film with a fixed embed and license', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(archiveRecord)));
    const result = await fetchArchiveFilms(fetcher as typeof fetch);
    expect(result.items[0]).toMatchObject({
      id: 'Sita_Sings_the_Blues',
      durationSec: 4891.24,
      embedUrl: 'https://archive.org/embed/Sita_Sings_the_Blues',
    });
  });
  it('rejects a record from an unexpected creator', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...archiveRecord,
            metadata: { ...archiveRecord.metadata, creator: 'Someone else' },
          }),
        ),
    );
    await expect(fetchArchiveFilms(fetcher as typeof fetch)).rejects.toMatchObject({
      code: 'EXTERNAL_FILMS_UNAVAILABLE',
    });
  });
  it('keeps another provider available if one provider fails', async () => {
    const archive = () =>
      fetchArchiveFilms(
        vi.fn(async () => new Response(JSON.stringify(archiveRecord))) as typeof fetch,
      );
    const failed = async () => {
      throw new Error('offline');
    };
    const result = await fetchExternalFilms([failed, archive]);
    expect(result.items).toHaveLength(1);
    expect(result.unavailable).toBe(1);
  });
});
