import { describe, expect, it, vi } from 'vitest';
import { AnimeService } from './anime.service';
import { resolveStreams } from './source-adapter';
import type * as SourceAdapter from './source-adapter';
vi.mock('./source-adapter', async (original) => ({
  ...(await original<typeof SourceAdapter>()),
  resolveStreams: vi.fn(),
}));
function setup() {
  const source = {
    id: 'source',
    enabled: true,
    verified: true,
    adapterId: 'test',
    providerType: 'series',
    providerId: 'episode-1',
    streamName: 'Japanese',
    edition: 'cut-a',
    episodeId: 'episode',
    episode: { animeId: 'anime', label: 'Episode 1', title: { id: 'anime', title: 'Test' } },
  };
  const prisma = { animeSource: { findUnique: vi.fn(async () => source) } };
  const config = {
    env: {
      ENABLE_ANIME: true,
      ANIME_ADAPTERS_JSON: JSON.stringify([
        {
          id: 'test',
          family: 'test',
          baseUrl: 'https://resolver.example',
          mediaHosts: ['cdn.example'],
          enabled: true,
        },
      ]),
    },
  };
  return { source, service: new AnimeService(prisma as never, config as never, {} as never) };
}
describe('anime resolution', () => {
  it('rejects unreviewed mappings before making network requests', async () => {
    const { source, service } = setup();
    source.verified = false;
    await expect(service.selection('source')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('coalesces requests, reports pending, and pins the reviewed language/stream', async () => {
    vi.mocked(resolveStreams).mockReset();
    let finish!: (value: Awaited<ReturnType<typeof resolveStreams>>) => void;
    vi.mocked(resolveStreams).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { service } = setup();
    const results = await Promise.all([service.playback('source'), service.playback('source')]);
    expect(results.map((r) => r.status)).toEqual(['pending', 'pending']);
    expect(resolveStreams).toHaveBeenCalledTimes(1);
    finish([
      {
        label: 'Dub',
        url: 'https://cdn.example/dub.mp4',
        format: 'MP4',
        mimeType: 'video/mp4',
        captions: [],
      },
      {
        label: 'Japanese',
        url: 'https://cdn.example/sub.mp4',
        format: 'MP4',
        mimeType: 'video/mp4',
        captions: [],
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ready = await service.playback('source');
    expect(ready.status).toBe('ready');
    expect(ready.sources).toHaveLength(1);
    expect(ready.sources[0]?.label).toBe('Japanese');
    expect(JSON.stringify(ready.externalMedia)).not.toContain('https');
  });
  it('distinguishes a failed lookup from a confirmed empty list', async () => {
    vi.mocked(resolveStreams).mockRejectedValueOnce(new Error('timeout'));
    const { service } = setup();
    await service.playback('source');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await service.playback('source')).status).toBe('unavailable');
  });
});
