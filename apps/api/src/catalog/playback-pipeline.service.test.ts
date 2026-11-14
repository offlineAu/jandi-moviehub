import { describe, expect, it, vi } from 'vitest';
import { Errors } from '../common/errors';
import { PlaybackPipelineService } from './playback-pipeline.service';

function setup() {
  const prisma = {
    movie: { findUnique: vi.fn(async () => ({ tmdbId: 155 })) },
    tvEpisodeMedia: { findUnique: vi.fn(async () => null) },
  };
  const catalog = { getPlaybackSources: vi.fn(async () => []) };
  const kisskh = { enabled: true, resolveMovie: vi.fn(async () => ({})) };
  const vidsrc = { enabled: false, listed: vi.fn(async () => true) };
  const service = new PlaybackPipelineService(
    prisma as never,
    catalog as never,
    kisskh as never,
    vidsrc as never,
    { env: { ENABLE_PLAYBACK_PIPELINE: true } } as never,
    { episode: vi.fn(async () => ({ episode: { number: 2 } })) } as never,
  );
  return { prisma, catalog, kisskh, vidsrc, service };
}
describe('movie playback candidate pipeline', () => {
  it('keeps resolver outage distinct from missing media and identifies embed sync capabilities', async () => {
    const { service, kisskh } = setup();
    kisskh.resolveMovie.mockRejectedValueOnce(new Error('timeout'));
    const { candidates } = await service.movie('movie');
    expect(candidates.map(({ provider, state }) => [provider, state])).toEqual([
      ['local', 'missing'],
      ['kisskh-direct', 'unavailable'],
      ['vidsrc', 'listed'],
    ]);
    expect(candidates[2]).toMatchObject({
      type: 'embed',
      roomControls: 'none',
      playbackConfirmed: false,
    });
  });
  it('coalesces concurrent requests and recognizes a confirmed absence', async () => {
    const { service, kisskh, vidsrc } = setup();
    kisskh.resolveMovie.mockRejectedValueOnce(
      Errors.unavailable('KISSKH_DIRECT_NO_STREAM', 'none'),
    );
    const [a, b] = await Promise.all([service.movie('movie'), service.movie('movie')]);
    expect(a).toEqual(b);
    expect(a.candidates[1]?.state).toBe('missing');
    expect(vidsrc.listed).toHaveBeenCalledTimes(1);
  });
  it('pauses repeated provider failures and retries after the cooldown', async () => {
    vi.useFakeTimers();
    try {
      const { service, kisskh } = setup();
      kisskh.resolveMovie.mockRejectedValue(new Error('outage'));
      for (let i = 0; i < 4; i++) await service.movie(`movie-${i}`);
      expect(kisskh.resolveMovie).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(30001);
      await service.movie('movie-after-cooldown');
      expect(kisskh.resolveMovie).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it('checks a canonical TV episode without inventing a provider numbering mapping', async () => {
    const { service, vidsrc } = setup();
    const result = await service.episode(1399, 1, 2);
    expect(result.candidates.map((candidate) => [candidate.provider, candidate.state])).toEqual([
      ['local', 'missing'],
      ['vidsrc', 'listed'],
    ]);
    expect(vidsrc.listed).toHaveBeenCalledWith({
      provider: 'vidsrc',
      type: 'tv',
      tvId: 1399,
      tmdbId: 1399,
      season: 1,
      episode: 2,
    });
  });
});
