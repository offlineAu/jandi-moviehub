import { Injectable } from '@nestjs/common';
import type { adminUserUpdateSchema } from '@jandi/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter, userChannel } from '../realtime/emitter';
import { publicUser, type UserWithProfile } from '../users/user-view';
import type { AdminUserQuery } from './admin.schemas';

export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;

export const adminUserView = (u: UserWithProfile) => ({
  ...publicUser(u),
  email: u.email,
  role: u.role,
  emailVerified: !!u.emailVerifiedAt,
  suspended: !!u.suspendedAt,
  suspendedAt: u.suspendedAt,
  lastSeenAt: u.lastSeenAt,
  createdAt: u.createdAt,
});

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async list(q: AdminUserQuery) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.q
        ? {
            OR: [
              { username: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { profile: { displayName: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: rows.map(adminUserView),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  /**
   * Changes role and/or suspension. Rules: the last active ADMIN can never be demoted or
   * suspended (checked under row locks so concurrent demotions cannot both succeed); an admin
   * cannot change their own role or suspend themselves; suspending revokes every session.
   */
  async update(actor: AuthUser, id: string, input: AdminUserUpdate, ip?: string) {
    const { user, newlySuspended } = await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, include: { profile: true } });
      if (!target) throw Errors.notFound('User');
      const wasSuspended = !!target.suspendedAt;
      const nextRole = input.role ?? target.role;
      const nextSuspended = input.suspended ?? wasSuspended;
      if (nextRole === target.role && nextSuspended === wasSuspended) {
        return { user: target, newlySuspended: false };
      }
      if (target.isGuest && nextRole !== 'USER') {
        throw Errors.badRequest('GUEST_ROLE', 'Guest accounts cannot be given a platform role');
      }
      const losesAdmin =
        target.role === 'ADMIN' && !wasSuspended && (nextRole !== 'ADMIN' || nextSuspended);
      if (losesAdmin) {
        const admins = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM users WHERE role = 'ADMIN' AND suspended_at IS NULL FOR UPDATE`;
        if (!admins.some((a) => a.id !== id)) {
          throw Errors.conflict('LAST_ADMIN', 'At least one active administrator must remain');
        }
      }
      if (id === actor.id) {
        throw Errors.forbidden(
          'You cannot change your own role or suspend yourself',
          'SELF_MODIFICATION',
        );
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          role: nextRole,
          suspendedAt: nextSuspended ? (target.suspendedAt ?? new Date()) : null,
        },
        include: { profile: true },
      });
      const newly = nextSuspended && !wasSuspended;
      let sessionsRevoked = 0;
      if (newly) sessionsRevoked = (await tx.session.deleteMany({ where: { userId: id } })).count;
      const changes: Record<string, { from: string | boolean; to: string | boolean }> = {};
      if (nextRole !== target.role) changes.role = { from: target.role, to: nextRole };
      if (nextSuspended !== wasSuspended)
        changes.suspended = { from: wasSuspended, to: nextSuspended };
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.user.update',
          targetType: 'user',
          targetId: id,
          metadata: { changes, ...(newly ? { sessionsRevoked } : {}) },
          ip,
        },
        tx,
      );
      return { user: updated, newlySuspended: newly };
    });
    // Live sockets were authenticated at handshake; drop them so the suspension takes effect immediately.
    if (newlySuspended) this.emitter.io?.in(userChannel(id)).disconnectSockets(true);
    return adminUserView(user);
  }
}
