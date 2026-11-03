import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE, type UserRole } from '@jandi/shared';
import { AppConfig } from '../config/app-config';
import { SessionService } from '../auth/session.service';
import {
  ALLOW_GUEST,
  type AuthedRequest,
  clientIp,
  IS_PUBLIC,
  RATE_LIMIT,
  type RateLimitOptions,
  ROLES,
} from './auth-context';
import { Errors } from './errors';
import { RateLimiterService } from './rate-limiter.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence: state-changing requests that carry a session cookie must come
 * from an allowed Origin (or Referer). Requests without a cookie cannot ride a session.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(config: AppConfig) {
    this.allowed = new Set([...config.env.WEB_ORIGINS, originOf(config.env.PUBLIC_API_URL)!]);
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (!req.cookies?.[SESSION_COOKIE]) return true;
    const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
    if (origin && this.allowed.has(origin)) return true;
    throw Errors.forbidden('Cross-site request blocked', 'CSRF_ORIGIN_MISMATCH');
  }
}

/** Resolves the session cookie and enforces @Public / @AllowGuest / @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) req.user = (await this.sessions.resolve(token)) ?? undefined;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (!req.user) {
      if (isPublic && !roles) return true;
      throw Errors.unauthorized();
    }
    const allowGuest = this.reflector.getAllAndOverride<boolean>(ALLOW_GUEST, targets);
    if (req.user.isGuest && !isPublic && !allowGuest) {
      throw Errors.forbidden('Create a free account to do that', 'GUEST_NOT_ALLOWED');
    }
    if (roles?.length && !hasRole(req.user.role, roles)) {
      throw Errors.forbidden();
    }
    return true;
  }
}

export function hasRole(role: UserRole, required: UserRole[]): boolean {
  if (role === 'ADMIN') return true;
  if (role === 'MODERATOR') return required.includes('MODERATOR') || required.includes('USER');
  return required.includes('USER');
}

/** Global per-IP limit plus optional per-route @RateLimit buckets (Redis-backed). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  static readonly GLOBAL = { limit: 600, windowSec: 60 };

  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const ip = clientIp(req);
    const global = await this.limiter.hit(
      `global:${ip}`,
      this.config.isTest ? 100_000 : RateLimitGuard.GLOBAL.limit,
      RateLimitGuard.GLOBAL.windowSec,
    );
    if (!global.allowed) throw Errors.tooMany(global.retryAfterSec);

    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!opts) return true;
    const subject = opts.by === 'user' && req.user ? `u:${req.user.id}` : `ip:${ip}`;
    const result = await this.limiter.hit(`${opts.name}:${subject}`, opts.limit, opts.windowSec);
    if (!result.allowed) throw Errors.tooMany(result.retryAfterSec);
    return true;
  }
}
