import { describe, expect, it, vi } from 'vitest';
import { ExternalMediaResolver, RoomSourcesController } from './room-sources.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { TvMetadataService } from './tv.service';
import type { VidsrcService } from './vidsrc.service';
const movieId = '00000000-0000-4000-8000-000000000001';
function setup() {
  const prisma = { movie: { findUnique: vi.fn(async () => ({ tmdbId: 155 })) } };
  const tv = { episode: vi.fn(async () => ({ episode: { number: 2 } })) };
  const vidsrc = { assertEnabled: vi.fn(), listed: vi.fn(async () => true), enabled: true };
  const resolver = new ExternalMediaResolver(
    prisma as unknown as PrismaService,
    tv as unknown as TvMetadataService,
    vidsrc as unknown as VidsrcService,
  );
  return {
    prisma,
    tv,
    vidsrc,
    resolver,
    controller: new RoomSourcesController(vidsrc as unknown as VidsrcService, resolver, {
      enabled: false,
    } as never),
  };
}
describe('room external media resolution', () => {
  it('derives movie identity from the database and validates episodes before querying the provider', async () => {
    const { resolver, vidsrc, tv } = setup();
    expect(await resolver.resolve({ provider: 'vidsrc', type: 'movie', movieId })).toEqual({
      provider: 'vidsrc',
      type: 'movie',
      movieId,
      tmdbId: 155,
    });
    expect(
      await resolver.resolve({ provider: 'vidsrc', type: 'tv', tvId: 1399, season: 1, episode: 2 }),
    ).toMatchObject({ tmdbId: 1399 });
    expect(tv.episode).toHaveBeenCalledWith(1399, 1, 2);
    expect(vidsrc.listed).toHaveBeenCalledTimes(2);
  });
  it('does not call external endpoints when disabled and distinguishes missing sources from outages', async () => {
    const { controller, resolver, vidsrc } = setup();
    vidsrc.assertEnabled.mockImplementationOnce(() => {
      throw new Error('disabled');
    });
    await expect(resolver.resolve({ provider: 'vidsrc', type: 'movie', movieId })).rejects.toThrow(
      'disabled',
    );
    expect(vidsrc.listed).not.toHaveBeenCalled();
    vidsrc.listed.mockResolvedValueOnce(false);
    expect(await controller.check({ movieId })).toEqual({
      listed: false,
      playbackConfirmed: false,
    });
    vidsrc.listed.mockRejectedValueOnce(new Error('upstream timeout'));
    await expect(controller.check({ movieId })).rejects.toThrow('upstream timeout');
    expect(await controller.check({ movieId })).toEqual({ listed: true, playbackConfirmed: false });
  });
});
