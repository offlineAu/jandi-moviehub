import { Injectable } from '@nestjs/common';
import { type NotificationDto, SocketEvents } from '@jandi/shared';
import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/emitter';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Prisma.InputJsonValue;
}

export const toNotificationDto = (n: Notification): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** Persists a notification and pushes it to the user's live sockets. */
  async notify(userId: string, input: NotifyInput) {
    const notification = await this.prisma.notification.create({ data: { userId, ...input } });
    this.emitter.toUser(userId, SocketEvents.NOTIFICATION, toNotificationDto(notification));
    return notification;
  }

  async list(userId: string, page: number, pageSize: number) {
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: items.map(toNotificationDto),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      unreadCount,
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
  }
}
