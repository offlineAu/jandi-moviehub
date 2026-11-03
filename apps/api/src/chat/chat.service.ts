import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type ChatMessageDto,
  type ReactionEmoji,
  type SendMessageInput,
  SocketEvents,
} from '@jandi/shared';
import type { Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import { SettingsService } from '../admin/settings.service';
import type { AuthUser } from '../common/auth-context';
import { sha256 } from '../common/crypto';
import { Errors } from '../common/errors';
import { RateLimiterService } from '../common/rate-limiter.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/emitter';
import { InjectRedis } from '../redis/redis.module';
import { RoomPermissions } from '../rooms/room-access';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { avatarUrl } from '../users/user-view';

const messageInclude = {
  author: { include: { profile: true } },
  replyTo: { include: { author: { include: { profile: true } } } },
  reactions: true,
} satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export const CHAT_LIMITS = {
  burst: { limit: 5, windowSec: 5 },
  sustained: { limit: 30, windowSec: 60 },
  duplicateWindowSec: 30,
  maxDuplicates: 2,
  reactions: { limit: 20, windowSec: 10 },
  bursts: { limit: 10, windowSec: 5 },
};

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly roomEvents: RoomEvents,
    private readonly emitter: RealtimeEmitter,
    private readonly limiter: RateLimiterService,
    @InjectRedis() private readonly redis: Redis,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    this.roomEvents.register({
      systemMessage: (roomId, body) => this.system(roomId, body).then(() => undefined),
    });
  }

  toDto(m: MessageRow, viewerId?: string): ChatMessageDto {
    const counts = new Map<string, { count: number; mine: boolean }>();
    for (const r of m.reactions) {
      const entry = counts.get(r.emoji) ?? { count: 0, mine: false };
      entry.count += 1;
      if (r.userId === viewerId) entry.mine = true;
      counts.set(r.emoji, entry);
    }
    const deleted = !!m.deletedAt;
    return {
      id: m.id,
      roomId: m.roomId,
      body: deleted ? '' : m.body,
      createdAt: m.createdAt.toISOString(),
      deleted,
      kind: m.kind,
      author: m.author
        ? {
            id: m.author.id,
            displayName: m.author.profile?.displayName ?? m.author.username,
            avatarUrl: avatarUrl(m.author.profile?.avatarKey),
            isGuest: m.author.isGuest,
          }
        : null,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            body: m.replyTo.deletedAt ? '' : m.replyTo.body.slice(0, 140),
            authorName:
              m.replyTo.author?.profile?.displayName ?? m.replyTo.author?.username ?? null,
          }
        : null,
      reactions: [...counts.entries()].map(([emoji, v]) => ({ emoji, ...v })),
    };
  }

  async history(user: AuthUser, roomId: string, before: string | undefined, limit: number) {
    await this.rooms.requireMember(roomId, user.id);
    const rows = await this.prisma.message.findMany({
      where: { roomId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      items: rows.reverse().map((m) => this.toDto(m, user.id)),
      hasMore: rows.length === limit,
    };
  }

  private async enforceRate(user: AuthUser, roomId: string, body: string) {
    const subject = `${roomId}:${user.id}`;
    for (const [name, rule] of [
      ['burst', CHAT_LIMITS.burst],
      ['sustained', CHAT_LIMITS.sustained],
    ] as const) {
      const r = await this.limiter.hit(`chat:${name}:${subject}`, rule.limit, rule.windowSec);
      if (!r.allowed) throw Errors.tooMany(r.retryAfterSec);
    }
    const slowModeSec = await this.settings.get('chat.slowModeSec');
    if (slowModeSec > 0) {
      const slow = await this.limiter.hit(`chat:slow:${subject}`, 1, slowModeSec);
      if (!slow.allowed) throw Errors.tooMany(slow.retryAfterSec);
    }
    const dupKey = `chat:dup:${subject}:${sha256(body.toLowerCase())}`;
    const count = await this.redis.incr(dupKey);
    if (count === 1) await this.redis.expire(dupKey, CHAT_LIMITS.duplicateWindowSec);
    if (count > CHAT_LIMITS.maxDuplicates) {
      throw Errors.badRequest(
        'SPAM_DETECTED',
        'You already sent that message — try saying something new',
      );
    }
  }

  async send(user: AuthUser, input: SendMessageInput): Promise<ChatMessageDto> {
    await this.rooms.requireMember(input.roomId, user.id);
    await this.enforceRate(user, input.roomId, input.body);
    if (input.replyToId) {
      const parent = await this.prisma.message.findUnique({ where: { id: input.replyToId } });
      if (!parent || parent.roomId !== input.roomId)
        throw Errors.badRequest('INVALID_REPLY', 'Reply target not found');
    }
    const message = await this.prisma.message.create({
      data: {
        roomId: input.roomId,
        authorId: user.id,
        body: input.body,
        replyToId: input.replyToId,
      },
      include: messageInclude,
    });
    const dto = { ...this.toDto(message), clientId: input.clientId };
    this.emitter.toRoom(input.roomId, SocketEvents.CHAT_MESSAGE, dto);
    return dto;
  }

  async system(roomId: string, body: string) {
    const message = await this.prisma.message.create({
      data: { roomId, kind: 'SYSTEM', body },
      include: messageInclude,
    });
    const dto = this.toDto(message);
    this.emitter.toRoom(roomId, SocketEvents.CHAT_MESSAGE, dto);
    return dto;
  }

  /** Authors can delete their own messages; hosts/co-hosts and platform moderators any. */
  async remove(user: AuthUser, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw Errors.notFound('Message');
    const isAuthor = message.authorId === user.id;
    const isPlatformMod = user.role === 'ADMIN' || user.role === 'MODERATOR';
    if (!isAuthor && !isPlatformMod) {
      const { member } = await this.rooms.requireMember(message.roomId, user.id);
      if (!RoomPermissions.canModerate(member.role) || message.kind === 'SYSTEM')
        throw Errors.forbidden();
    }
    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedById: user.id, body: '' },
    });
    this.emitter.toRoom(message.roomId, SocketEvents.CHAT_DELETED, {
      roomId: message.roomId,
      messageId,
    });
    return { roomId: message.roomId, messageId };
  }

  /** Toggles a reaction; broadcasts the new count for that emoji. */
  async react(user: AuthUser, roomId: string, messageId: string, emoji: ReactionEmoji) {
    await this.rooms.requireMember(roomId, user.id);
    const r = await this.limiter.hit(
      `chat:react:${roomId}:${user.id}`,
      CHAT_LIMITS.reactions.limit,
      CHAT_LIMITS.reactions.windowSec,
    );
    if (!r.allowed) throw Errors.tooMany(r.retryAfterSec);
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.roomId !== roomId || message.deletedAt)
      throw Errors.notFound('Message');
    const key = { messageId_userId_emoji: { messageId, userId: user.id, emoji } };
    const existing = await this.prisma.reaction.findUnique({ where: key });
    if (existing) await this.prisma.reaction.delete({ where: key });
    else await this.prisma.reaction.create({ data: { messageId, userId: user.id, emoji } });
    const count = await this.prisma.reaction.count({ where: { messageId, emoji } });
    const payload = { roomId, messageId, emoji, count, userId: user.id, added: !existing };
    this.emitter.toRoom(roomId, SocketEvents.CHAT_REACTIONS, payload);
    return payload;
  }

  /** Ephemeral floating reaction over the player (not persisted). */
  async burst(user: AuthUser, roomId: string, emoji: ReactionEmoji) {
    await this.rooms.requireMember(roomId, user.id);
    const r = await this.limiter.hit(
      `chat:burst:${roomId}:${user.id}`,
      CHAT_LIMITS.bursts.limit,
      CHAT_LIMITS.bursts.windowSec,
    );
    if (!r.allowed) throw Errors.tooMany(r.retryAfterSec);
    const payload = {
      roomId,
      emoji,
      userId: user.id,
      displayName: user.displayName,
      at: Date.now(),
    };
    this.emitter.toRoom(roomId, SocketEvents.REACTION_BURST, payload);
    return payload;
  }
}
