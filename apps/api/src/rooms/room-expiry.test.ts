import { describe, expect, it, vi } from 'vitest';
import { RoomsService } from './rooms.service';

describe('room inactivity sweep', () => {
  it('warns members with a room link and closes only rooms still inactive', async () => {
    const now = Date.now();
    const rooms = [
      {
        id: 'warning',
        code: 'WARN',
        name: 'Movie night',
        lastActiveAt: new Date(now - 24 * 86400000),
      },
      { id: 'expired', code: 'OLD', name: 'Old room', lastActiveAt: new Date(now - 31 * 86400000) },
      {
        id: 'active-again',
        code: 'NEW',
        name: 'Active room',
        lastActiveAt: new Date(now - 31 * 86400000),
      },
    ];
    const prisma = {
      room: {
        findMany: vi.fn().mockResolvedValue(rooms),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
      roomMember: { findMany: vi.fn().mockResolvedValue([{ userId: 'member' }]) },
      notification: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const emitter = { toRoom: vi.fn(), io: undefined };
    const notifications = { notify: vi.fn() };
    const timers = { register: vi.fn(), schedule: vi.fn() };
    const events = { roomClosed: vi.fn() };
    const service = new RoomsService(
      prisma as never,
      emitter as never,
      notifications as never,
      {} as never,
      timers as never,
      events as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service.onModuleInit();
    const sweep = timers.register.mock.calls.find(([name]) => name === 'room-expiry-sweep')![1];
    await sweep();
    expect(notifications.notify).toHaveBeenCalledWith(
      'member',
      expect.objectContaining({ link: '/rooms/WARN', title: 'Room expiring soon' }),
    );
    expect(prisma.room.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'expired', lastActiveAt: rooms[1]!.lastActiveAt }),
      }),
    );
    expect(events.roomClosed).toHaveBeenCalledTimes(1);
    expect(events.roomClosed).toHaveBeenCalledWith('expired');
    expect(timers.schedule).toHaveBeenCalledWith('room-expiry-sweep', 'global', {}, 3600000);
  });
});
