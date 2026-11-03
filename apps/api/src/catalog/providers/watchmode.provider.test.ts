import { describe, expect, it, vi } from 'vitest';
import { WatchmodeProvider } from './watchmode.provider';

describe('Watchmode availability', () => {
  it('requests the chosen region with a header key, and returns only safe matching links', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { name: 'Service', type: 'sub', region: 'PH', web_url: 'https://example.com/title/1' },
          { name: 'Unsafe', type: 'free', region: 'PH', web_url: 'javascript:alert(1)' },
          { name: 'Other region', type: 'sub', region: 'US', web_url: 'https://example.com/' },
        ]),
        { status: 200 },
      ),
    );
    const provider = new WatchmodeProvider(
      'secret',
      { get: async () => null, set: async () => {} },
      fetcher as typeof fetch,
    );
    const result = await provider.sources('tv', 71446, 'PH');
    expect(fetcher.mock.calls[0]![0].toString()).toBe(
      'https://api.watchmode.com/v1/title/tv-71446/sources/?regions=PH',
    );
    expect(fetcher.mock.calls[0]![1].headers['X-API-Key']).toBe('secret');
    expect(result).toMatchObject([
      { provider: 'Service', url: 'https://example.com/title/1' },
      { provider: 'Unsafe', url: null },
    ]);
  });
  it('reports upstream failures without leaking secrets', async () => {
    const provider = new WatchmodeProvider(
      'secret',
      { get: async () => null, set: async () => {} },
      vi.fn().mockResolvedValue(new Response('', { status: 401 })) as typeof fetch,
    );
    await expect(provider.sources('movie', 1, 'PH')).rejects.toMatchObject({
      code: 'AVAILABILITY_UNAVAILABLE',
    });
  });
});
