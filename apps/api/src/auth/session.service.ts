import { Injectable } from '@nestjs/common';
import { SESSION_COOKIE } from '@jandi/shared';
import type { Prisma } from '@prisma/client';
import type { CookieOptions, Response } from 'express';
import { AppConfig } from '../config/app-config';
import type { AuthUser } from '../common/auth-context';
import { randomToken, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  ttlMs(isGuest: boolean) {
    return isGuest
      ? this.config.env.GUEST_SESSION_TTL_HOURS * 3600_000
      : this.config.env.SESSION_TTL_DAYS * 86_400_000;
  }

  async create(userId: string, isGuest: boolean, meta: { ip?: string; userAgent?: string } = {}) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + this.ttlMs(isGuest));
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
      },
    });
    return { token, expiresAt, sessionId: session.id };
  }

  /** Returns the authenticated user for a raw session token, or null if invalid/expired/suspended. */
  async resolve(token: string): Promise<AuthUser | null> {
    if (!token || token.length > 200) return null;
    return this.resolveSession({ tokenHash: sha256(token) });
  }

  /** Used after redeeming a short-lived realtime ticket; checks revocation and expiry again. */
  resolveById(id: string): Promise<AuthUser | null> {
    return this.resolveSession({ id });
  }

  private async resolveSession(where: Prisma.SessionWhereUniqueInput): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where,
      include: { user: { include: { profile: true } } },
    });
    if (!session) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now || session.user.suspendedAt) {
      if (session.expiresAt.getTime() <= now) {
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      return null;
    }
    if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } })
        .catch(() => undefined);
    }
    const { user } = session;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isGuest: user.isGuest,
      displayName: user.profile?.displayName ?? user.username,
      avatarKey: user.profile?.avatarKey ?? null,
      emailVerified: !!user.emailVerifiedAt,
      sessionId: session.id,
    };
  }

  revoke(sessionId: string) {
    return this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  revokeAll(userId: string, exceptSessionId?: string) {
    return this.prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  cookieOptions(expiresAt?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      domain: this.config.env.COOKIE_DOMAIN,
      expires: expiresAt,
    };
  }

  setCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(expiresAt));
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), expires: undefined });
  }
}
