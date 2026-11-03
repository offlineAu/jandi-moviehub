import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { publicUser } from '../users/user-view';

const pair = (a: string, b: string) =>
  a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly presence: PresenceService,
  ) {}

  async friendIds(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });
    return rows.map((f) => ({
      id: f.userAId === userId ? f.userBId : f.userAId,
      since: f.createdAt,
    }));
  }

  /** Friends with presence; online/watching honour each friend's showOnlineStatus setting. */
  async listFriends(user: AuthUser) {
    const ids = await this.friendIds(user.id);
    if (!ids.length) return { items: [] };
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids.map((f) => f.id) } },
      include: { profile: true },
    });
    const visible = users.filter((u) => u.profile?.showOnlineStatus !== false).map((u) => u.id);
    const [online, watching] = await Promise.all([
      this.presence.onlineAmong(visible),
      this.presence.watching(visible),
    ]);
    const roomIds = [...new Set(watching.values())];
    const rooms = await this.prisma.room.findMany({
      where: { id: { in: roomIds }, status: 'OPEN' },
      include: { movie: { select: { title: true } } },
    });
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const since = new Map(ids.map((f) => [f.id, f.since]));
    const items = users.map((u) => {
      const roomId = watching.get(u.id);
      const room = roomId ? roomById.get(roomId) : undefined;
      // Only reveal room details for rooms the viewer could plausibly join.
      const shareable = room && (room.visibility === 'PUBLIC' || room.visibility === 'FRIENDS');
      return {
        user: publicUser(u),
        since: since.get(u.id),
        online: online.has(u.id),
        watching: room
          ? shareable
            ? {
                roomCode: room.code,
                roomName: room.name,
                movieTitle: room.movie?.title ?? null,
                private: false,
              }
            : { roomCode: null, roomName: null, movieTitle: null, private: true }
          : null,
      };
    });
    items.sort(
      (a, b) =>
        Number(b.online) - Number(a.online) || a.user.displayName.localeCompare(b.user.displayName),
    );
    return { items };
  }

  async requests(user: AuthUser) {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where: { toId: user.id, status: 'PENDING' },
        include: { from: { include: { profile: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friendRequest.findMany({
        where: { fromId: user.id, status: 'PENDING' },
        include: { to: { include: { profile: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      incoming: incoming.map((r) => ({
        id: r.id,
        user: publicUser(r.from),
        createdAt: r.createdAt,
      })),
      outgoing: outgoing.map((r) => ({ id: r.id, user: publicUser(r.to), createdAt: r.createdAt })),
    };
  }

  async sendRequest(user: AuthUser, username: string) {
    const target = await this.prisma.user.findUnique({
      where: { username },
      include: { profile: true },
    });
    if (!target || target.isGuest || target.suspendedAt) throw Errors.notFound('User');
    if (target.id === user.id)
      throw Errors.badRequest('INVALID_TARGET', "You can't befriend yourself");
    if (
      await this.prisma.friendship.findUnique({
        where: { userAId_userBId: pair(user.id, target.id) },
      })
    ) {
      throw Errors.conflict('ALREADY_FRIENDS', 'You are already friends');
    }
    // A pending request in the other direction means both want it: accept immediately.
    const reverse = await this.prisma.friendRequest.findUnique({
      where: { fromId_toId: { fromId: target.id, toId: user.id } },
    });
    if (reverse?.status === 'PENDING') {
      await this.accept(user, reverse.id);
      return { status: 'ACCEPTED' as const };
    }
    await this.prisma.friendRequest.upsert({
      where: { fromId_toId: { fromId: user.id, toId: target.id } },
      create: { fromId: user.id, toId: target.id },
      update: { status: 'PENDING', createdAt: new Date(), respondedAt: null },
    });
    await this.notifications.notify(target.id, {
      type: 'FRIEND_REQUEST',
      title: `${user.displayName} sent you a friend request`,
      link: '/friends',
      data: { fromId: user.id },
    });
    return { status: 'PENDING' as const };
  }

  async accept(user: AuthUser, requestId: string) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request || request.toId !== user.id || request.status !== 'PENDING')
      throw Errors.notFound('Friend request');
    await this.prisma.$transaction([
      this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      this.prisma.friendship.upsert({
        where: { userAId_userBId: pair(request.fromId, request.toId) },
        create: pair(request.fromId, request.toId),
        update: {},
      }),
    ]);
    await this.notifications.notify(request.fromId, {
      type: 'FRIEND_ACCEPTED',
      title: `${user.displayName} accepted your friend request`,
      link: `/profile/${user.username}`,
      data: { userId: user.id },
    });
  }

  async decline(user: AuthUser, requestId: string) {
    const { count } = await this.prisma.friendRequest.updateMany({
      where: { id: requestId, toId: user.id, status: 'PENDING' },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    if (!count) throw Errors.notFound('Friend request');
  }

  async cancel(user: AuthUser, requestId: string) {
    const { count } = await this.prisma.friendRequest.updateMany({
      where: { id: requestId, fromId: user.id, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    if (!count) throw Errors.notFound('Friend request');
  }

  async remove(user: AuthUser, friendId: string) {
    const { count } = await this.prisma.friendship.deleteMany({ where: pair(user.id, friendId) });
    if (!count) throw Errors.notFound('Friend');
    await this.prisma.friendRequest.updateMany({
      where: {
        OR: [
          { fromId: user.id, toId: friendId },
          { fromId: friendId, toId: user.id },
        ],
        status: 'ACCEPTED',
      },
      data: { status: 'CANCELLED' },
    });
  }
}
