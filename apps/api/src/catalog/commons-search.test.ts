import { describe, expect, it, vi } from 'vitest';
import { searchCommons } from './commons-search';

describe('Commons candidate discovery', () => {
  it('uses only the official API and returns video candidates without approving them', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: {
            pages: [
              {
                pageid: 123,
                title: 'File:Example.webm',
                imageinfo: [
                  {
                    mime: 'video/webm',
                    size: 100,
                    extmetadata: {
                      LicenseShortName: { value: 'CC BY 4.0' },
                      Artist: { value: '<b>Creator</b>' },
                    },
                  },
                ],
              },
              { pageid: 456, title: 'File:Image.jpg', imageinfo: [{ mime: 'image/jpeg' }] },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const result = await searchCommons('example', fetcher);
    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.origin).toBe('https://commons.wikimedia.org');
    expect(url.searchParams.get('gsrsearch')).toBe('example filetype:video');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: 'error' });
    expect(result).toEqual([
      {
        id: 123,
        title: 'Example.webm',
        sourceUrl: 'https://commons.wikimedia.org/?curid=123',
        mime: 'video/webm',
        sizeBytes: 100,
        license: 'CC BY 4.0',
        artist: 'Creator',
        licenseUrl: '',
      },
    ]);
  });
  it('reports upstream failures without exposing internal errors', async () => {
    await expect(
      searchCommons('test', vi.fn().mockRejectedValue(new Error('network'))),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  });
});
