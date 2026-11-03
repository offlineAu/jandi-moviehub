import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type FriendshipStatus = 'self' | 'friends' | 'outgoing' | 'incoming' | 'none';

/** Friendships are stored once per pair with userAId < userBId. */
export function friendshipKey(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

/** Read-side helpers for the social graph (shared by users, library, rooms, social). */
@Injectable()
export class FriendshipQuery {
  constructor(private readonly prisma: PrismaService) {}

  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const row = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: friendshipKey(a, b) },
    });
    return !!row;
  }

  async friendshipStatus(viewerId: string | undefined, otherId: string): Promise<FriendshipStatus> {
    if (!viewerId) return 'none';
    return (await this.statusMap(viewerId, [otherId])).get(otherId) ?? 'none';
  }

  /** Status of `viewerId` towards each of `otherIds`. */
  async statusMap(viewerId: string, otherIds: string[]): Promise<Map<string, FriendshipStatus>> {
    const result = new Map<string, FriendshipStatus>();
    const others = [...new Set(otherIds)].filter((id) => id !== viewerId);
    if (otherIds.includes(viewerId)) result.set(viewerId, 'self');
    if (!others.length) return result;
    const [friendships, requests] = await Promise.all([
      this.prisma.friendship.findMany({
        where: {
          OR: [
            { userAId: viewerId, userBId: { in: others } },
            { userBId: viewerId, userAId: { in: others } },
          ],
        },
        select: { userAId: true, userBId: true },
      }),
      this.prisma.friendRequest.findMany({
        where: {
          status: 'PENDING',
          OR: [
            { fromId: viewerId, toId: { in: others } },
            { toId: viewerId, fromId: { in: others } },
          ],
        },
        select: { fromId: true, toId: true },
      }),
    ]);
    for (const id of others) result.set(id, 'none');
    for (const r of requests) {
      if (r.fromId === viewerId) result.set(r.toId, 'outgoing');
      else result.set(r.fromId, 'incoming');
    }
    for (const f of friendships)
      result.set(f.userAId === viewerId ? f.userBId : f.userAId, 'friends');
    return result;
  }

  /** Ids of all accepted friends of a user. */
  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    return rows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));
  }
}
