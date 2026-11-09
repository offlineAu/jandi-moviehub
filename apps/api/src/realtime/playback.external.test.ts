import { expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { PrismaService } from '../prisma/prisma.service';
import type { TimerQueue } from '../queue/timer-queue.service';
import type { RealtimeEmitter } from './emitter';
import type { MediaResolver } from './media-resolver';
import type { MovieboxService } from '../catalog/moviebox.controller';
import type { ExternalSeriesService } from '../catalog/external-series.controller';
import type { ExternalMediaResolver } from '../catalog/room-sources.controller';
import type { VidsrcService } from '../catalog/vidsrc.service';
import { PlaybackService } from './playback.service';

it('persists external identity and duration and restores after losing the Redis state', async () => {
  const store = new Map<string, string>();
  const redis = {
    defineCommand: vi.fn(),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    exists: vi.fn(async () => 0),
    set: vi.fn(async (key: string, value: string) => {
      if (!store.has(key)) store.set(key, value);
      return 'OK';
    }),
    playbackCas: vi.fn(async (key: string, _command: string, _version: number, next: string) => {
      store.set(key, next);
      return ['OK', next];
    }),
  };
  let row: Record<string, unknown> | null = null;
  const prisma = {
    room: { update: vi.fn() },
    roomPlaybackState: {
      findUnique: vi.fn(async () => row),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        row = { ...create };
      }),
    },
  };
  const media = {
    provider: 'vidsrc' as const,
    type: 'tv' as const,
    tmdbId: 1399,
    tvId: 1399,
    season: 1,
    episode: 2,
  };
  const service = new PlaybackService(
    redis as unknown as Redis,
    prisma as unknown as PrismaService,
    { schedule: vi.fn() } as unknown as TimerQueue,
    { toRoom: vi.fn() } as unknown as RealtimeEmitter,
    {} as MediaResolver,
    {} as MovieboxService,
    {} as ExternalSeriesService,
    { resolve: vi.fn(async () => media) } as unknown as ExternalMediaResolver,
    { assertEnabled: vi.fn() } as unknown as VidsrcService,
    { assertEnabled: vi.fn() } as never,
  );
  const loaded = await service.loadMovie('room', 'vidsrc:tv:1399:1:2', { autoplay: false });
  if (!loaded.ok) throw new Error('load failed');
  const metadata = await service.applyCommand(
    'room',
    { type: 'duration', durationSec: 600 },
    { actorId: 'host', baseVersion: loaded.data.version, commandId: 'metadata-command' },
  );
  expect(metadata.ok).toBe(true);
  store.delete('pb:room');
  const restored = await service.getState('room');
  expect(restored).toMatchObject({
    externalMedia: media,
    status: 'paused',
    positionSec: 0,
    durationSec: 600,
  });
  expect(prisma.room.update).toHaveBeenCalledWith({
    where: { id: 'room' },
    data: { movieId: null },
  });
});
