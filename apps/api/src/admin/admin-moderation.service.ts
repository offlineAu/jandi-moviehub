import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ChatService } from '../chat/chat.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { publicUser } from '../users/user-view';
import type { AdminAuditQuery, AdminRoomQuery } from './admin.schemas';

const withProfile = { include: { profile: true } } as const;

@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rooms: RoomsService,
    private readonly chat: ChatService,
  ) {}

  /** Every room regardless of visibility, with host identity and member counts. */
  async listRooms(q: AdminRoomQuery) {
    const where: Prisma.RoomWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { code: { equals: q.q.toUpperCase() } },
              { host: { username: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: {
          host: withProfile,
          movie: { select: { id: true, title: true } },
          _count: { select: { members: { where: { leftAt: null } }, messages: true } },
        },
        orderBy: [{ lastActiveAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.room.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        visibility: r.visibility,
        status: r.status,
        allowGuests: r.allowGuests,
        maxMembers: r.maxMembers,
        host: publicUser(r.host),
        movie: r.movie,
        memberCount: r._count.members,
        messageCount: r._count.messages,
        onlineCount: r.status === 'OPEN' ? await this.rooms.onlineCount(r.id) : 0,
        createdAt: r.createdAt,
        lastActiveAt: r.lastActiveAt,
        closedAt: r.closedAt,
      })),
    );
    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  /** Closes a room; RoomsService writes the `admin.room.close` audit row. */
  async closeRoom(actor: AuthUser, roomId: string, ip?: string) {
    await this.rooms.close(actor, roomId, { asAdmin: true, ip });
  }

  async deleteMessage(actor: AuthUser, messageId: string, ip?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { authorId: true, roomId: true, kind: true },
    });
    if (!message) throw Errors.notFound('Message');
    const result = await this.chat.remove(actor, messageId);
    await this.audit.record({
      actorId: actor.id,
      action: 'admin.message.delete',
      targetType: 'message',
      targetId: messageId,
      metadata: { roomId: result.roomId, authorId: message.authorId, kind: message.kind },
      ip,
    });
  }

  async listAudit(q: AdminAuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action
        ? { OR: [{ action: q.action }, { action: { startsWith: `${q.action}.` } }] }
        : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: withProfile },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      ip: r.ip,
      createdAt: r.createdAt,
      actor: r.actor ? publicUser(r.actor) : null,
    }));
    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }
}
