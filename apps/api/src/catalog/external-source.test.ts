import { VidsrcService } from './vidsrc.service';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/app-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogController } from './catalog.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { CatalogService } from './catalog.service';

const controller = () =>
  new CatalogController(
    {} as CatalogService,
    {
      movie: { findUnique: vi.fn(async () => ({ tmdbId: 155 })) },
    } as unknown as PrismaService,
    new VidsrcService(
      { get: vi.fn(async () => null), set: vi.fn(async () => 'OK') } as unknown as Redis,
      {} as AppConfig,
    ),
  );

afterEach(() => vi.unstubAllGlobals());

describe('third-party source lookup', () => {
  it('returns a fixed-host embed only when the reported title ID matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status_code: 200, type: 'movie', tmdb_id: '155' })),
      ),
    );
    await expect(controller().externalSource('movie-id')).resolves.toEqual({
      available: true,
      embedUrl: 'https://vidsrc.sh/embed/movie/155',
    });
  });
  it('rejects a mismatched title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status_code: 200, type: 'movie', tmdb_id: '156' })),
      ),
    );
    await expect(controller().externalSource('movie-id')).rejects.toMatchObject({
      code: 'EXTERNAL_SOURCE_UNAVAILABLE',
    });
  });
  it('reports a missing source as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    await expect(controller().externalSource('movie-id')).resolves.toEqual({
      available: false,
      embedUrl: null,
    });
  });
});
