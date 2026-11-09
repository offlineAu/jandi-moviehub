import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { GuestInput, LoginInput, RegisterInput } from '@jandi/shared';
import { AuthTokenType, Prisma } from '@prisma/client';
import { SettingsService } from '../admin/settings.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-context';
import { randomToken, sha256 } from '../common/crypto';
import { Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';
import { MailService } from '../mail/mail.service';
import { mailTemplates } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { avatarUrl } from '../users/user-view';
import { hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';

const TOKEN_TTL: Record<AuthTokenType, number> = {
  EMAIL_VERIFY: 48 * 3600_000,
  PASSWORD_RESET: 60 * 60_000,
};

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta) {
    if (!(await this.settings.get('registration.enabled'))) {
      throw Errors.forbidden('New registrations are currently closed', 'REGISTRATION_DISABLED');
    }
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            username: input.username,
            passwordHash,
            profile: { create: { displayName: input.displayName } },
          },
        });
        await tx.watchlist.create({
          data: { ownerId: created.id, name: 'My Watchlist', isDefault: true },
        });
        return created;
      });
      // The account exists now: a mail outage must not turn a successful sign-up into an error.
      const verificationEmailSent = await this.sendVerification(
        { id: user.id, email: input.email, displayName: input.displayName },
        { required: false },
      );
      const session = await this.sessions.create(user.id, false, meta);
      return { userId: user.id, session, verificationEmailSent };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String((error.meta?.target as string[] | undefined)?.join(',') ?? '');
        throw Errors.conflict(
          target.includes('username') ? 'USERNAME_TAKEN' : 'EMAIL_TAKEN',
          target.includes('username')
            ? 'That username is taken'
            : 'An account with that email already exists',
        );
      }
      throw error;
    }
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(user?.passwordHash, input.password);
    if (!user || !valid) throw Errors.unauthorized('Invalid email or password');
    if (user.suspendedAt) throw Errors.forbidden('This account is suspended', 'ACCOUNT_SUSPENDED');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    const session = await this.sessions.create(user.id, false, meta);
    return { userId: user.id, session };
  }

  async createGuest(input: GuestInput, meta: RequestMeta) {
    const user = await this.prisma.user.create({
      data: {
        username: `guest_${randomBytes(8).toString('hex')}`,
        isGuest: true,
        profile: {
          create: {
            displayName: `${input.displayName} (guest)`.slice(0, 48),
            discoverable: false,
            showOnlineStatus: false,
          },
        },
      },
    });
    const session = await this.sessions.create(user.id, true, meta);
    return { userId: user.id, session };
  }

  async me(user: AuthUser) {
    const full = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { profile: true },
    });
    const p = full.profile;
    return {
      id: full.id,
      username: full.username,
      email: full.email,
      role: full.role,
      isGuest: full.isGuest,
      emailVerified: !!full.emailVerifiedAt,
      displayName: p?.displayName ?? full.username,
      bio: p?.bio ?? null,
      avatarUrl: avatarUrl(p?.avatarKey),
      preferences: p?.preferences ?? {},
      privacy: {
        profileVisibility: p?.profileVisibility ?? 'PUBLIC',
        watchHistoryVisibility: p?.watchHistoryVisibility ?? 'PRIVATE',
        showOnlineStatus: p?.showOnlineStatus ?? true,
        discoverable: p?.discoverable ?? true,
      },
      createdAt: full.createdAt,
    };
  }

  // ───────── Email tokens ─────────

  private async issueToken(userId: string, type: AuthTokenType) {
    const token = randomToken(32);
    await this.prisma.$transaction([
      // Only the most recent token of a type stays valid.
      this.prisma.authToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          type,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL[type]),
        },
      }),
    ]);
    return token;
  }

  private async consumeToken(token: string, type: AuthTokenType) {
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
      throw Errors.badRequest('INVALID_TOKEN', 'This link is invalid or has expired');
    }
    // Conditional update guards against a concurrent double use.
    const { count } = await this.prisma.authToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0)
      throw Errors.badRequest('INVALID_TOKEN', 'This link is invalid or has expired');
    return record;
  }

  /** Issues a fresh verification link and emails it. Returns whether delivery succeeded. */
  async sendVerification(
    user: { id: string; email: string; displayName: string },
    { required }: { required: boolean },
  ): Promise<boolean> {
    const token = await this.issueToken(user.id, 'EMAIL_VERIFY');
    const message = {
      to: user.email,
      ...mailTemplates.verifyEmail({
        displayName: user.displayName,
        link: `${this.config.env.PUBLIC_WEB_URL}/verify-email?token=${token}`,
        expiresInHours: TOKEN_TTL.EMAIL_VERIFY / 3600_000,
      }),
    };
    if (required) {
      await this.mail.send(message, 'verification');
      return true;
    }
    return this.mail.trySend(message, 'verification');
  }

  async resendVerification(user: AuthUser) {
    if (user.emailVerified || !user.email) return;
    await this.sendVerification(
      { id: user.id, email: user.email, displayName: user.displayName },
      { required: true },
    );
  }

  async verifyEmail(token: string) {
    const record = await this.consumeToken(token, 'EMAIL_VERIFY');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /** Always resolves (no account enumeration); emails a reset link when the account exists. */
  async requestPasswordReset(email: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isGuest || user.suspendedAt) return;
    const token = await this.issueToken(user.id, 'PASSWORD_RESET');
    const link = `${this.config.env.PUBLIC_WEB_URL}/reset-password?token=${token}`;
    // Never surface delivery failures here: a 503 only for existing accounts would reveal them.
    await this.mail.trySend(
      {
        to: email,
        ...mailTemplates.passwordReset({
          link,
          expiresInMinutes: TOKEN_TTL.PASSWORD_RESET / 60_000,
        }),
      },
      'password reset',
    );
    await this.audit.record({
      actorId: user.id,
      action: 'auth.password_reset_requested',
      ip: meta.ip,
    });
  }

  async confirmPasswordReset(token: string, password: string, meta: RequestMeta) {
    const record = await this.consumeToken(token, 'PASSWORD_RESET');
    const passwordHash = await hashPassword(password);
    await this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await this.sessions.revokeAll(record.userId);
    await this.audit.record({ actorId: record.userId, action: 'auth.password_reset', ip: meta.ip });
  }

  async changePassword(
    user: AuthUser,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ) {
    const full = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(full.passwordHash, currentPassword))) {
      throw Errors.badRequest('INVALID_PASSWORD', 'Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.sessions.revokeAll(user.id, user.sessionId);
    await this.audit.record({ actorId: user.id, action: 'auth.password_changed', ip: meta.ip });
  }

  listSessions(user: AuthUser) {
    return this.prisma.session
      .findMany({
        where: { userId: user.id, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          ip: true,
          userAgent: true,
        },
      })
      .then((rows) => rows.map((r) => ({ ...r, current: r.id === user.sessionId })));
  }

  async revokeSession(user: AuthUser, sessionId: string) {
    const { count } = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId: user.id },
    });
    if (!count) throw Errors.notFound('Session');
  }
}
