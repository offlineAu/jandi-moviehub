import { Injectable } from '@nestjs/common';
import type {
  createReportSchema,
  ReportStatus,
  ReportTarget,
  resolveReportSchema,
} from '@jandi/shared';
import type { Prisma, Report } from '@prisma/client';
import type { z } from 'zod';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { publicUser, type UserWithProfile } from '../users/user-view';

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

type PublicUser = ReturnType<typeof publicUser>;

/** A short, resolved view of what a report points at (for moderators). */
export type ReportTargetPreview =
  | { type: 'USER'; user: PublicUser; suspended: boolean }
  | {
      type: 'MESSAGE';
      id: string;
      body: string;
      deleted: boolean;
      createdAt: Date;
      author: PublicUser | null;
      room: { id: string; name: string };
    }
  | {
      type: 'ROOM';
      id: string;
      name: string;
      code: string;
      status: string;
      visibility: string;
      host: PublicUser;
    }
  | { type: 'PLAYLIST'; id: string; name: string; visibility: string; owner: PublicUser };

const withProfile = { include: { profile: true } } as const;

export const reportView = (r: Report) => ({
  id: r.id,
  targetType: r.targetType,
  targetId: r.targetId,
  reason: r.reason,
  status: r.status,
  resolutionNote: r.resolutionNote,
  createdAt: r.createdAt,
  resolvedAt: r.resolvedAt,
});

export interface AdminReportQuery {
  status?: ReportStatus;
  targetType?: ReportTarget;
  page: number;
  pageSize: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Throws NOT_FOUND unless the reported entity exists. */
  private async assertTargetExists(reporter: AuthUser, type: ReportTarget, id: string) {
    let exists = false;
    switch (type) {
      case 'USER':
        if (id === reporter.id)
          throw Errors.badRequest('CANNOT_REPORT_SELF', 'You cannot report yourself');
        exists = !!(await this.prisma.user.findUnique({ where: { id }, select: { id: true } }));
        break;
      case 'MESSAGE': {
        const m = await this.prisma.message.findUnique({ where: { id }, select: { kind: true } });
        exists = !!m && m.kind === 'USER';
        break;
      }
      case 'ROOM':
        exists = !!(await this.prisma.room.findUnique({ where: { id }, select: { id: true } }));
        break;
      case 'PLAYLIST':
        exists = !!(await this.prisma.playlist.findUnique({ where: { id }, select: { id: true } }));
        break;
    }
    if (!exists) throw Errors.notFound('Report target');
  }

  async create(reporter: AuthUser, input: CreateReportInput) {
    await this.assertTargetExists(reporter, input.targetType, input.targetId);
    const report = await this.prisma.$transaction(async (tx) => {
      // Serialise concurrent reports of the same target by the same user so the OPEN dedupe holds.
      const lockKey = `report:${reporter.id}:${input.targetType}:${input.targetId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const open = await tx.report.findFirst({
        where: {
          reporterId: reporter.id,
          targetType: input.targetType,
          targetId: input.targetId,
          status: 'OPEN',
        },
        select: { id: true },
      });
      if (open)
        throw Errors.conflict(
          'ALREADY_REPORTED',
          'You already reported this. A moderator will review it.',
        );
      return tx.report.create({
        data: {
          reporterId: reporter.id,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
        },
      });
    });
    return reportView(report);
  }

  async listMine(user: AuthUser, page: number, pageSize: number) {
    const where = { reporterId: user.id } satisfies Prisma.ReportWhereInput;
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);
    return {
      items: rows.map(reportView),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // ───────── Moderation ─────────

  async adminList(q: AdminReportQuery) {
    const where: Prisma.ReportWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { reporter: withProfile, resolvedBy: withProfile },
        // The OPEN queue is worked oldest-first; any other view is newest-first.
        orderBy: [{ createdAt: q.status === 'OPEN' ? 'asc' : 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);
    const previews = await this.previews(rows);
    const items = rows.map((r) => ({
      ...reportView(r),
      reporter: r.reporter ? publicUser(r.reporter) : null,
      resolvedBy: r.resolvedBy ? publicUser(r.resolvedBy) : null,
      target: previews.get(`${r.targetType}:${r.targetId}`) ?? null,
    }));
    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  /** Batch-resolves report targets; missing (deleted) targets are simply absent from the map. */
  async previews(rows: Array<{ targetType: ReportTarget; targetId: string }>) {
    const ids = (type: ReportTarget) => [
      ...new Set(rows.filter((r) => r.targetType === type).map((r) => r.targetId)),
    ];
    const [users, messages, rooms, playlists] = await Promise.all([
      ids('USER').length
        ? this.prisma.user.findMany({ where: { id: { in: ids('USER') } }, ...withProfile })
        : [],
      ids('MESSAGE').length
        ? this.prisma.message.findMany({
            where: { id: { in: ids('MESSAGE') } },
            include: { author: withProfile, room: { select: { id: true, name: true } } },
          })
        : [],
      ids('ROOM').length
        ? this.prisma.room.findMany({
            where: { id: { in: ids('ROOM') } },
            include: { host: withProfile },
          })
        : [],
      ids('PLAYLIST').length
        ? this.prisma.playlist.findMany({
            where: { id: { in: ids('PLAYLIST') } },
            include: { owner: withProfile },
          })
        : [],
    ]);
    const map = new Map<string, ReportTargetPreview>();
    for (const u of users)
      map.set(`USER:${u.id}`, { type: 'USER', user: publicUser(u), suspended: !!u.suspendedAt });
    for (const m of messages) {
      map.set(`MESSAGE:${m.id}`, {
        type: 'MESSAGE',
        id: m.id,
        body: m.body,
        deleted: !!m.deletedAt,
        createdAt: m.createdAt,
        author: m.author ? publicUser(m.author as UserWithProfile) : null,
        room: m.room,
      });
    }
    for (const r of rooms) {
      map.set(`ROOM:${r.id}`, {
        type: 'ROOM',
        id: r.id,
        name: r.name,
        code: r.code,
        status: r.status,
        visibility: r.visibility,
        host: publicUser(r.host),
      });
    }
    for (const p of playlists) {
      map.set(`PLAYLIST:${p.id}`, {
        type: 'PLAYLIST',
        id: p.id,
        name: p.name,
        visibility: p.visibility,
        owner: publicUser(p.owner),
      });
    }
    return map;
  }

  async resolve(actor: AuthUser, id: string, input: ResolveReportInput, ip?: string) {
    const existing = await this.prisma.report.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('Report');
    const report = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.update({
        where: { id },
        data: {
          status: input.status,
          resolutionNote: input.resolutionNote || null,
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.report.resolve',
          targetType: 'report',
          targetId: id,
          metadata: {
            from: existing.status,
            to: input.status,
            reportTargetType: existing.targetType,
            reportTargetId: existing.targetId,
            hasNote: !!input.resolutionNote,
          },
          ip,
        },
        tx,
      );
      return updated;
    });
    return reportView(report);
  }
}
