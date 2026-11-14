import { parseRoomTvTitle, parseExternalTitle, selectionTitle } from '@jandi/shared';
import { Injectable, Logger, type OnModuleInit, type OnApplicationBootstrap } from '@nestjs/common';
import {
  type CreateRoomInput,
  SocketEvents,
  type UpdateRoomInput,
  type RoomRole,
} from '@jandi/shared';
import { Prisma, type Room, type RoomMember } from '@prisma/client';
import { TvMetadataService } from '../catalog/tv.service';
import { SettingsService } from '../admin/settings.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-context';
import { randomToken, roomCode, sha256 } from '../common/crypto';
import { Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';
import { hashPassword, verifyPassword } from '../auth/password';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimerQueue } from '../queue/timer-queue.service';
import { RealtimeEmitter } from '../realtime/emitter';
import { FriendshipQuery } from '../users/friendship.query';
import { publicUser, type UserWithProfile } from '../users/user-view';
import { RoomPermissions } from './room-access';
import { RoomEvents } from './room-events';

const movieBriefSelect = {
  id: true,
  title: true,
  posterUrl: true,
  backdropUrl: true,
  releaseDate: true,
  runtimeMin: true,
  isDemo: true,
} satisfies Prisma.MovieSelect;

type MovieBriefRow = Prisma.MovieGetPayload<{ select: typeof movieBriefSelect }>;
export const movieBrief = (m: MovieBriefRow | null) =>
  m
    ? {
        id: m.id,
        title: m.title,
        posterUrl: m.posterUrl,
        backdropUrl: m.backdropUrl,
        year: m.releaseDate?.getUTCFullYear() ?? null,
        runtimeMin: m.runtimeMin,
        isDemo: m.isDemo,
      }
    : null;

const roomInclude = {
  host: { include: { profile: true } },
  movie: { select: movieBriefSelect },
  playbackState: { select: { tvEpisode: true, externalMedia: true } },
  _count: { select: { members: { where: { leftAt: null } } } },
} satisfies Prisma.RoomInclude;
type RoomRow = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

export interface ActiveMembership {
  room: Room;
  member: RoomMember;
}

const HOST_GRACE_SEC_DEFAULT = 60;

@Injectable()
export class RoomsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly timers: TimerQueue,
    private readonly events: RoomEvents,
    private readonly config: AppConfig,
    private readonly friendships: FriendshipQuery,
    private readonly settings: SettingsService,
    private readonly tv: TvMetadataService,
  ) {}

  onModuleInit() {
    this.timers.register('room-expiry-sweep', () => this.sweepInactiveRooms());
    this.timers.register('host-grace', (data) =>
      this.handleHostGrace(String(data.roomId), String(data.hostId)),
    );
    this.timers.register('room-reminder', (data) =>
      this.sendScheduledReminder(String(data.roomId)),
    );
  }

  async onApplicationBootstrap() {
    await this.timers.schedule('room-expiry-sweep', 'global', {}, 1000);
  }

  private async sweepInactiveRooms() {
    try {
      const now = Date.now();
      const warningCutoff = new Date(now - 23 * 86400000);
      const expiredCutoff = new Date(now - 30 * 86400000);
      const rooms = await this.prisma.room.findMany({
        where: { status: 'OPEN', lastActiveAt: { lte: warningCutoff } },
        select: { id: true, code: true, name: true, hostId: true, lastActiveAt: true },
      });
      for (const room of rooms) {
        if (room.lastActiveAt <= expiredCutoff) {
          const closed = await this.prisma.room.updateMany({
            where: { id: room.id, status: 'OPEN', lastActiveAt: room.lastActiveAt },
            data: { status: 'CLOSED', closedAt: new Date() },
          });
          if (closed.count) {
            await this.events.roomClosed(room.id);
            this.emitter.toRoom(room.id, SocketEvents.ROOM_CLOSED, {
              roomId: room.id,
              by: 'expiry',
            });
            this.emitter.io?.in(`room:${room.id}`).socketsLeave(`room:${room.id}`);
          }
        } else {
          const link = `/rooms/${room.code}`;
          const members = await this.prisma.roomMember.findMany({
            where: { roomId: room.id, leftAt: null, user: { isGuest: false } },
            select: { userId: true },
          });
          for (const member of members) {
            const existing = await this.prisma.notification.findFirst({
              where: {
                userId: member.userId,
                type: 'SYSTEM',
                link,
                title: 'Room expiring soon',
                createdAt: { gte: room.lastActiveAt },
              },
              select: { id: true },
            });
            if (!existing)
              await this.notifications.notify(member.userId, {
                type: 'SYSTEM',
                title: 'Room expiring soon',
                link,
                body: `${room.name} will close after 30 days of inactivity. Open the room to keep it active.`,
              });
          }
        }
      }
    } finally {
      await this.timers.schedule('room-expiry-sweep', 'global', {}, 3600000);
    }
  }

  async touchActivity(roomId: string) {
    const result = await this.prisma.room.updateMany({
      where: { id: roomId, status: 'OPEN' },
      data: { lastActiveAt: new Date() },
    });
    if (!result.count) throw Errors.conflict('ROOM_CLOSED', 'This room has been closed');
  }

  private async selectedTitle(room: RoomRow) {
    if (room.movie) return movieBrief(room.movie);
    const external = room.playbackState?.externalMedia as {
      type?: string;
      tvId?: number;
      sourceId?: string;
    } | null;
    const episode = room.playbackState?.tvEpisode as { tvId?: string } | null;
    if (external?.type === 'anime' && external.sourceId) {
      const source = await this.prisma.animeSource.findUnique({
        where: { id: external.sourceId },
        include: { episode: { include: { title: true } } },
      });
      if (source)
        return {
          id: source.episode.title.id,
          title: source.episode.title.title,
          posterUrl: source.episode.title.posterUrl,
          backdropUrl: null,
          year: null,
          runtimeMin: null,
          isDemo: false,
        };
    }
    const tvId = external?.type === 'tv' ? external.tvId : Number(episode?.tvId);
    if (!tvId) return null;
    const result = await this.tv.detail(tvId).catch(() => null);
    return {
      id: String(tvId),
      title: result?.series.title ?? (tvId === 71446 ? 'Money Heist' : 'Series'),
      posterUrl: result?.series.posterUrl ?? null,
      backdropUrl: result?.series.backdropUrl ?? null,
      year: null,
      runtimeMin: null,
      isDemo: false,
    };
  }

  get hostGraceSec() {
    const v = Number(process.env.HOST_RECONNECT_GRACE_SEC);
    return Number.isFinite(v) && v > 0 ? v : HOST_GRACE_SEC_DEFAULT;
  }

  // ───────── Views ─────────

  async toDto(room: RoomRow, viewerId?: string, extra: { onlineCount?: number } = {}) {
    const membership = viewerId
      ? await this.prisma.roomMember.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: viewerId } },
        })
      : null;
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      description: room.description,
      visibility: room.visibility,
      status: room.status,
      allowGuests: room.allowGuests,
      controlPolicy: room.controlPolicy,
      maxMembers: room.maxMembers,
      scheduledFor: room.scheduledFor,
      createdAt: room.createdAt,
      lastActiveAt: room.lastActiveAt,
      requiresPassword: room.visibility === 'PASSWORD',
      host: publicUser(room.host as UserWithProfile),
      movie: await this.selectedTitle(room),
      memberCount: room._count.members,
      onlineCount: extra.onlineCount ?? (await this.onlineCount(room.id)),
      membership:
        membership && !membership.leftAt
          ? { role: membership.role, joinedAt: membership.joinedAt }
          : null,
    };
  }

  async onlineCount(roomId: string) {
    const sockets = await this.emitter.roomSockets(roomId);
    return new Set(sockets.map((s) => (s.data as { user?: { id: string } }).user?.id)).size;
  }

  private findRow(where: Prisma.RoomWhereUniqueInput) {
    return this.prisma.room.findUnique({ where, include: roomInclude });
  }

  // ───────── Access ─────────

  async areFriends(a: string, b: string) {
    return a === b || this.friendships.areFriends(a, b);
  }

  /** Active membership in an open room, or throws NOT_IN_ROOM. */
  async requireMember(roomId: string, userId: string): Promise<ActiveMembership> {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { room: true },
    });
    if (!member || member.leftAt) throw Errors.forbidden('Join the room first', 'NOT_IN_ROOM');
    if (member.room.status !== 'OPEN')
      throw Errors.conflict('ROOM_CLOSED', 'This room has been closed');
    const { room, ...rest } = member;
    return { room, member: rest };
  }

  async requireRole(roomId: string, userId: string, check: (role: RoomRole) => boolean) {
    const m = await this.requireMember(roomId, userId);
    if (!check(m.member.role)) throw Errors.forbidden();
    return m;
  }

  private async findValidInvite(roomId: string, token: string | undefined, userId: string) {
    if (!token) return null;
    const invite = await this.prisma.roomInvite.findUnique({ where: { tokenHash: sha256(token) } });
    if (
      !invite ||
      invite.roomId !== roomId ||
      invite.revokedAt ||
      invite.expiresAt < new Date() ||
      (invite.maxUses != null && invite.uses >= invite.maxUses) ||
      (invite.inviteeUserId && invite.inviteeUserId !== userId)
    ) {
      return null;
    }
    return invite;
  }

  /**
   * Room preview by code. Private rooms are only visible to members and invitees, so a code
   * alone never reveals a private room's details.
   */
  async previewByCode(code: string, viewer: AuthUser | undefined, inviteToken?: string) {
    const room = await this.findRow({ code: code.toUpperCase() });
    if (!room) throw Errors.notFound('Room');
    const viewerId = viewer?.id;
    const membership = viewerId
      ? await this.prisma.roomMember.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: viewerId } },
        })
      : null;
    const isMember = !!membership && !membership.leftAt;
    const invite = viewerId ? await this.findValidInvite(room.id, inviteToken, viewerId) : null;
    const isFriend = viewerId ? await this.areFriends(room.hostId, viewerId) : false;
    const visible =
      isMember ||
      !!invite ||
      room.visibility === 'PUBLIC' ||
      room.visibility === 'PASSWORD' ||
      (room.visibility === 'FRIENDS' && isFriend);
    if (!visible) throw Errors.notFound('Room');
    const banned = viewerId
      ? !!(await this.prisma.roomBan.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: viewerId } },
        }))
      : false;
    const dto = await this.toDto(room, viewerId);
    if (room.visibility === 'PASSWORD' && !isMember && !invite) {
      // Password rooms show only a minimal card until joined.
      return {
        room: { ...dto, description: null, movie: null },
        access: {
          banned,
          isMember,
          requiresPassword: true,
          guestBlocked: !!viewer?.isGuest && !room.allowGuests,
        },
      };
    }
    return {
      room: dto,
      access: {
        banned,
        isMember,
        requiresPassword: false,
        guestBlocked: !!viewer?.isGuest && !room.allowGuests,
      },
    };
  }

  // ───────── CRUD ─────────

  async create(user: AuthUser, input: CreateRoomInput) {
    input = {
      ...input,
      movieId: input.playbackSelection ? selectionTitle(input.playbackSelection) : input.movieId,
    };
    if (input.movieId && !parseRoomTvTitle(input.movieId) && !parseExternalTitle(input.movieId))
      await this.prisma.movie.findUniqueOrThrow({ where: { id: input.movieId } }).catch(() => {
        throw Errors.badRequest('INVALID_MOVIE', 'Movie not found');
      });
    const passwordHash =
      input.visibility === 'PASSWORD' && input.password ? await hashPassword(input.password) : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const room = await this.prisma.room.create({
          data: {
            code: roomCode(8),
            name: input.name,
            description: input.description,
            visibility: input.visibility,
            passwordHash,
            hostId: user.id,
            allowGuests: input.allowGuests,
            controlPolicy: input.controlPolicy,
            maxMembers: input.maxMembers ?? (await this.settings.get('rooms.maxMembersDefault')),
            movieId:
              input.movieId &&
              !parseRoomTvTitle(input.movieId) &&
              !parseExternalTitle(input.movieId)
                ? input.movieId
                : undefined,
            scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
            members: { create: { userId: user.id, role: 'HOST' } },
          },
          include: roomInclude,
        });
        try {
          await this.events.roomCreated(room.id, user.id, input.movieId ?? null);
        } catch (error) {
          await this.prisma.room.delete({ where: { id: room.id } });
          throw error;
        }
        if (room.scheduledFor) await this.scheduleReminder(room.id, room.scheduledFor);
        const saved = await this.findRow({ id: room.id });
        return this.toDto(saved!, user.id, { onlineCount: 0 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          continue;
        throw error;
      }
    }
    throw Errors.conflict('CODE_COLLISION', 'Could not allocate a room code, try again');
  }

  async update(user: AuthUser, roomId: string, input: UpdateRoomInput) {
    await this.requireRole(roomId, user.id, RoomPermissions.canEditRoom);
    const current = await this.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    const visibility = input.visibility ?? current.visibility;
    let passwordHash: string | null | undefined;
    if (visibility === 'PASSWORD') {
      if (input.password) passwordHash = await hashPassword(input.password);
      else if (!current.passwordHash)
        throw Errors.badRequest('PASSWORD_REQUIRED', 'Password-protected rooms need a password');
    } else {
      passwordHash = null;
    }
    const room = await this.prisma.room.update({
      where: { id: roomId },
      data: {
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        allowGuests: input.allowGuests,
        controlPolicy: input.controlPolicy,
        maxMembers: input.maxMembers,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
        ...(passwordHash !== undefined ? { passwordHash } : {}),
      },
      include: roomInclude,
    });
    if (input.scheduledFor && room.scheduledFor)
      await this.scheduleReminder(room.id, room.scheduledFor);
    const dto = await this.toDto(room, user.id);
    this.emitter.toRoom(roomId, SocketEvents.ROOM_UPDATED, { ...dto, membership: undefined });
    await this.events.roomUpdated(roomId);
    return dto;
  }

  async close(actor: AuthUser, roomId: string, opts: { asAdmin?: boolean; ip?: string } = {}) {
    if (!opts.asAdmin) await this.requireRole(roomId, actor.id, RoomPermissions.canEditRoom);
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw Errors.notFound('Room');
    if (room.status === 'CLOSED') return;
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await this.events.roomClosed(roomId);
    this.emitter.toRoom(roomId, SocketEvents.ROOM_CLOSED, {
      roomId,
      by: opts.asAdmin ? 'admin' : 'host',
    });
    this.emitter.io?.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);
    if (opts.asAdmin) {
      await this.audit.record({
        actorId: actor.id,
        action: 'admin.room.close',
        targetType: 'room',
        targetId: roomId,
        ip: opts.ip,
      });
    }
  }

  // ───────── Listing ─────────

  async listPublic(viewer: AuthUser | undefined, page: number, pageSize: number, q?: string) {
    const where: Prisma.RoomWhereInput = {
      visibility: 'PUBLIC',
      status: 'OPEN',
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: roomInclude,
        orderBy: { lastActiveAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.room.count({ where }),
    ]);
    const items = await Promise.all(rows.map((r) => this.toDto(r, viewer?.id)));
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async listMine(user: AuthUser) {
    const rows = await this.prisma.room.findMany({
      where: { status: 'OPEN', members: { some: { userId: user.id, leftAt: null } } },
      include: roomInclude,
      orderBy: { lastActiveAt: 'desc' },
      take: 50,
    });
    return { items: await Promise.all(rows.map((r) => this.toDto(r, user.id))) };
  }

  /** Friends-only rooms hosted by the viewer's friends. */
  async listFriends(user: AuthUser) {
    const friendIds = await this.friendships.friendIds(user.id);
    if (!friendIds.length) return { items: [] };
    const rows = await this.prisma.room.findMany({
      where: {
        status: 'OPEN',
        visibility: { in: ['FRIENDS', 'PUBLIC'] },
        hostId: { in: friendIds },
      },
      include: roomInclude,
      orderBy: { lastActiveAt: 'desc' },
      take: 50,
    });
    return { items: await Promise.all(rows.map((r) => this.toDto(r, user.id))) };
  }

  async get(roomId: string, viewer: AuthUser) {
    await this.requireMember(roomId, viewer.id);
    const room = await this.findRow({ id: roomId });
    return this.toDto(room!, viewer.id);
  }

  // ───────── Membership ─────────

  async join(user: AuthUser, roomId: string, input: { password?: string; inviteToken?: string }) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw Errors.notFound('Room');
    if (room.status !== 'OPEN') throw Errors.conflict('ROOM_CLOSED', 'This room has been closed');
    const ban = await this.prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    });
    if (ban) throw Errors.forbidden('You are banned from this room', 'BANNED');

    const existing = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    });
    if (existing && !existing.leftAt) return { role: existing.role, alreadyMember: true };
    if (user.isGuest && !room.allowGuests)
      throw Errors.forbidden('This room does not allow guests', 'GUESTS_NOT_ALLOWED');

    const invite = await this.findValidInvite(roomId, input.inviteToken, user.id);
    let allowed = !!invite || room.hostId === user.id;
    if (!allowed) {
      switch (room.visibility) {
        case 'PUBLIC':
          allowed = true;
          break;
        case 'PASSWORD':
          if (!input.password)
            throw Errors.forbidden('This room needs a password', 'PASSWORD_REQUIRED');
          allowed = await verifyPassword(room.passwordHash, input.password);
          if (!allowed) throw Errors.forbidden('Incorrect room password', 'WRONG_PASSWORD');
          break;
        case 'FRIENDS':
          allowed = await this.areFriends(room.hostId, user.id);
          if (!allowed) throw Errors.forbidden("Only the host's friends can join", 'FRIENDS_ONLY');
          break;
        case 'PRIVATE':
          throw Errors.forbidden('This room is invite-only', 'INVITE_REQUIRED');
      }
    }

    const member = await this.prisma.$transaction(async (tx) => {
      const active = await tx.roomMember.count({ where: { roomId, leftAt: null } });
      if (active >= room.maxMembers) throw Errors.conflict('ROOM_FULL', 'This room is full');
      if (invite) {
        const { count } = await tx.roomInvite.updateMany({
          where: {
            id: invite.id,
            revokedAt: null,
            ...(invite.maxUses != null ? { uses: { lt: invite.maxUses } } : {}),
          },
          data: { uses: { increment: 1 } },
        });
        if (!count) throw Errors.forbidden('This invite is no longer valid', 'INVITE_REQUIRED');
      }
      return tx.roomMember.upsert({
        where: { roomId_userId: { roomId, userId: user.id } },
        create: { roomId, userId: user.id, role: room.hostId === user.id ? 'HOST' : 'MEMBER' },
        update: {
          leftAt: null,
          role: room.hostId === user.id ? 'HOST' : 'MEMBER',
          joinedAt: new Date(),
        },
      });
    });
    await this.prisma.room.update({ where: { id: roomId }, data: { lastActiveAt: new Date() } });
    await this.events.systemMessage(roomId, `${user.displayName} joined the room`);
    return { role: member.role, alreadyMember: false };
  }

  async leave(user: AuthUser, roomId: string) {
    const { member } = await this.requireMember(roomId, user.id);
    await this.prisma.roomMember.update({ where: { id: member.id }, data: { leftAt: new Date() } });
    if (member.role === 'HOST') await this.autoTransferHost(roomId, user.id, 'left');
    await this.emitter.evictUser(roomId, user.id);
    await this.events.systemMessage(roomId, `${user.displayName} left the room`);
    await this.events.presenceChanged(roomId);
  }

  async members(roomId: string, viewer: AuthUser) {
    await this.requireMember(roomId, viewer.id);
    const [rows, sockets] = await Promise.all([
      this.prisma.roomMember.findMany({
        where: { roomId, leftAt: null },
        include: { user: { include: { profile: true } } },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      }),
      this.emitter.roomSockets(roomId),
    ]);
    const online = new Set(sockets.map((s) => (s.data as { user?: { id: string } }).user?.id));
    return {
      items: rows.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        online: online.has(m.userId),
        user: publicUser(m.user),
      })),
    };
  }

  async setRole(actor: AuthUser, roomId: string, userId: string, role: 'COHOST' | 'MEMBER') {
    await this.requireRole(roomId, actor.id, RoomPermissions.canManageRoles);
    const target = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!target || target.leftAt) throw Errors.notFound('Member');
    if (target.role === 'HOST')
      throw Errors.badRequest('INVALID_TARGET', 'Use host transfer to change the host');
    await this.prisma.roomMember.update({ where: { id: target.id }, data: { role } });
    await this.events.presenceChanged(roomId);
    await this.events.systemMessage(
      roomId,
      role === 'COHOST' ? 'A member was promoted to co-host' : 'A co-host was changed to member',
    );
  }

  async kick(
    actor: AuthUser,
    roomId: string,
    userId: string,
    opts: { ban?: boolean; reason?: string } = {},
  ) {
    const { member } = await this.requireRole(roomId, actor.id, RoomPermissions.canModerate);
    if (userId === actor.id)
      throw Errors.badRequest('INVALID_TARGET', 'You cannot remove yourself');
    const target = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (target && !RoomPermissions.canRemove(member.role, target.role)) throw Errors.forbidden();
    if (!target && !opts.ban) throw Errors.notFound('Member');
    await this.prisma.$transaction(async (tx) => {
      if (target && !target.leftAt)
        await tx.roomMember.update({ where: { id: target.id }, data: { leftAt: new Date() } });
      if (opts.ban) {
        await tx.roomBan.upsert({
          where: { roomId_userId: { roomId, userId } },
          create: { roomId, userId, bannedById: actor.id, reason: opts.reason },
          update: { bannedById: actor.id, reason: opts.reason },
        });
      }
    });
    this.emitter.toUser(userId, SocketEvents.MEMBER_KICKED, {
      roomId,
      banned: !!opts.ban,
      reason: opts.reason ?? null,
    });
    await this.emitter.evictUser(roomId, userId);
    await this.events.presenceChanged(roomId);
    await this.events.systemMessage(
      roomId,
      opts.ban ? 'A member was banned from the room' : 'A member was removed from the room',
    );
  }

  async unban(actor: AuthUser, roomId: string, userId: string) {
    await this.requireRole(roomId, actor.id, RoomPermissions.canModerate);
    await this.prisma.roomBan.deleteMany({ where: { roomId, userId } });
  }

  async bans(actor: AuthUser, roomId: string) {
    await this.requireRole(roomId, actor.id, RoomPermissions.canModerate);
    const rows = await this.prisma.roomBan.findMany({
      where: { roomId },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((b) => ({
        user: publicUser(b.user),
        reason: b.reason,
        createdAt: b.createdAt,
      })),
    };
  }

  async transferHost(actor: AuthUser, roomId: string, userId: string) {
    await this.requireRole(roomId, actor.id, (r) => r === 'HOST');
    await this.doTransfer(roomId, actor.id, userId, 'manual');
  }

  private async doTransfer(
    roomId: string,
    fromId: string,
    toId: string,
    reason: 'manual' | 'left' | 'disconnected',
  ) {
    const target = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: toId } },
      include: { user: { include: { profile: true } } },
    });
    if (!target || target.leftAt) throw Errors.notFound('Member');
    if (target.user.isGuest) throw Errors.badRequest('INVALID_TARGET', 'Guests cannot become host');
    await this.prisma.$transaction([
      this.prisma.roomMember.updateMany({
        where: { roomId, userId: fromId, role: 'HOST' },
        data: { role: 'COHOST' },
      }),
      this.prisma.roomMember.update({ where: { id: target.id }, data: { role: 'HOST' } }),
      this.prisma.room.update({ where: { id: roomId }, data: { hostId: toId } }),
    ]);
    this.emitter.toRoom(roomId, SocketEvents.HOST_TRANSFER, {
      roomId,
      fromUserId: fromId,
      toUserId: toId,
      reason,
    });
    await this.events.presenceChanged(roomId);
    const name = target.user.profile?.displayName ?? target.user.username;
    await this.events.systemMessage(roomId, `${name} is now the host`);
  }

  /** Picks a successor: an online co-host, else the longest-standing online member, else any member. */
  private async autoTransferHost(roomId: string, fromId: string, reason: 'left' | 'disconnected') {
    const candidates = await this.prisma.roomMember.findMany({
      where: { roomId, leftAt: null, userId: { not: fromId }, user: { isGuest: false } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    if (!candidates.length) return false;
    const sockets = await this.emitter.roomSockets(roomId);
    const online = new Set(sockets.map((s) => (s.data as { user?: { id: string } }).user?.id));
    const onlineCandidates = candidates.filter((c) => online.has(c.userId));
    if (reason === 'disconnected' && !onlineCandidates.length) return false;
    const pick = onlineCandidates[0] ?? candidates[0]!;
    await this.doTransfer(roomId, fromId, pick.userId, reason);
    return true;
  }

  /** Called by the gateway when the host's last socket leaves the room channel. */
  async onHostDisconnected(roomId: string, hostId: string) {
    await this.timers.schedule(
      'host-grace',
      `${roomId}`,
      { roomId, hostId },
      this.hostGraceSec * 1000,
    );
  }

  async onHostReconnected(roomId: string) {
    await this.timers.cancel('host-grace', `${roomId}`);
  }

  private async handleHostGrace(roomId: string, hostId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.status !== 'OPEN' || room.hostId !== hostId) return;
    const sockets = await this.emitter.roomSockets(roomId);
    if (sockets.some((s) => (s.data as { user?: { id: string } }).user?.id === hostId)) return;
    const moved = await this.autoTransferHost(roomId, hostId, 'disconnected');
    if (moved) this.logger.log(`Host of room ${roomId} transferred after disconnect grace period`);
  }

  // ───────── Invites ─────────

  async createInvite(
    actor: AuthUser,
    roomId: string,
    input: { maxUses?: number; expiresInHours: number; inviteeUserId?: string },
  ) {
    const { room, member } = await this.requireMember(roomId, actor.id);
    if (!RoomPermissions.canInvite(member.role, room.visibility)) throw Errors.forbidden();
    const token = randomToken(32);
    const invite = await this.prisma.roomInvite.create({
      data: {
        roomId,
        tokenHash: sha256(token),
        createdById: actor.id,
        inviteeUserId: input.inviteeUserId,
        maxUses: input.maxUses,
        expiresAt: new Date(Date.now() + input.expiresInHours * 3600_000),
      },
    });
    const url = `${this.config.env.PUBLIC_WEB_URL}/join/${token}`;
    if (input.inviteeUserId) {
      await this.notifications.notify(input.inviteeUserId, {
        type: 'ROOM_INVITE',
        title: `${actor.displayName} invited you to “${room.name}”`,
        body: 'Join the watch party',
        link: `/join/${token}`,
        data: { roomId },
      });
    }
    return {
      invite: {
        id: invite.id,
        token, // returned exactly once; only the hash is stored
        url,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        uses: invite.uses,
      },
    };
  }

  async listInvites(actor: AuthUser, roomId: string) {
    await this.requireRole(roomId, actor.id, RoomPermissions.canModerate);
    const rows = await this.prisma.roomInvite.findMany({
      where: { roomId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((i) => ({
        id: i.id,
        expiresAt: i.expiresAt,
        maxUses: i.maxUses,
        uses: i.uses,
        createdAt: i.createdAt,
        inviteeUserId: i.inviteeUserId,
      })),
    };
  }

  async revokeInvite(actor: AuthUser, roomId: string, inviteId: string) {
    await this.requireRole(roomId, actor.id, RoomPermissions.canModerate);
    await this.prisma.roomInvite.updateMany({
      where: { id: inviteId, roomId },
      data: { revokedAt: new Date() },
    });
  }

  /** Resolves an invite link to a room preview (used by /join/:token). */
  async resolveInvite(token: string, viewer: AuthUser | undefined) {
    const invite = await this.prisma.roomInvite.findUnique({ where: { tokenHash: sha256(token) } });
    if (
      !invite ||
      invite.revokedAt ||
      invite.expiresAt < new Date() ||
      (invite.maxUses != null && invite.uses >= invite.maxUses)
    ) {
      throw Errors.notFound('Invite');
    }
    const room = await this.findRow({ id: invite.roomId });
    if (!room || room.status !== 'OPEN') throw Errors.notFound('Invite');
    return {
      room: await this.toDto(room, viewer?.id),
      invite: { expiresAt: invite.expiresAt, forSpecificUser: !!invite.inviteeUserId },
    };
  }

  // ───────── Scheduling ─────────

  private async scheduleReminder(roomId: string, at: Date) {
    const delay = at.getTime() - Date.now() - 5 * 60_000;
    if (at.getTime() <= Date.now()) return;
    await this.timers.schedule('room-reminder', roomId, { roomId }, Math.max(0, delay));
  }

  private async sendScheduledReminder(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { members: { where: { leftAt: null } } },
    });
    if (!room || room.status !== 'OPEN' || !room.scheduledFor) return;
    await Promise.all(
      room.members.map((m) =>
        this.notifications.notify(m.userId, {
          type: 'ROOM_STARTING',
          title: `“${room.name}” starts soon`,
          body: `Scheduled for ${room.scheduledFor!.toISOString()}`,
          link: `/rooms/${room.code}`,
          data: { roomId },
        }),
      ),
    );
  }
}
