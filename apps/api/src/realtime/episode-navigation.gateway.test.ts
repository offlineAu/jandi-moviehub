import { expect, it, vi } from 'vitest';
import { RoomGateway } from './room.gateway';
const roomId = '00000000-0000-4000-8000-000000000001';
const target = 'kisskh-direct:71446:4:1:2513:57306';
function setup(version: number, next: string) {
  const playback = {
    getState: vi.fn(async () => ({ version })),
    loadMovie: vi.fn(async () => ({ ok: true, data: { version: version + 1 } })),
  };
  const navigation = { navigation: vi.fn(async () => ({ next: { id: next }, previous: null })) };
  const gateway = new RoomGateway(
    {} as never,
    { toRoom: vi.fn() } as never,
    {
      requireMember: vi.fn(async () => ({
        room: { controlPolicy: 'HOST_ONLY' },
        member: { role: 'HOST' },
      })),
    } as never,
    {} as never,
    playback as never,
    {} as never,
    {} as never,
    { isActive: vi.fn(async () => false) } as never,
    { hit: vi.fn(async () => ({ allowed: true })) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    navigation as never,
  );
  const socket = { data: { user: { id: 'host' }, rooms: new Set([roomId]) } } as never;
  return { gateway, socket, playback, navigation };
}
it('rejects a stale episode choice before changing the room', async () => {
  const { gateway, socket, playback, navigation } = setup(8, target);
  const result = await gateway.movieChange(socket, {
    roomId,
    commandId: 'command-123',
    baseVersion: 7,
    movieId: target,
    episodeDirection: 'next',
  });
  expect(result).toMatchObject({ ok: false, error: { code: 'STALE' } });
  expect(navigation.navigation).not.toHaveBeenCalled();
  expect(playback.loadMovie).not.toHaveBeenCalled();
});
it('rejects a destination that is no longer adjacent', async () => {
  const { gateway, socket, playback } = setup(8, 'kisskh-direct:71446:4:2:2513:57307');
  const result = await gateway.movieChange(socket, {
    roomId,
    commandId: 'command-123',
    baseVersion: 8,
    movieId: target,
    episodeDirection: 'next',
  });
  expect(result).toMatchObject({ ok: false, error: { code: 'STALE' } });
  expect(playback.loadMovie).not.toHaveBeenCalled();
});
