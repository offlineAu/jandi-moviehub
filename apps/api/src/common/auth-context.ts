import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@jandi/shared';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  isGuest: boolean;
  displayName: string;
  avatarKey: string | null;
  emailVerified: boolean;
  sessionId: string;
}

export type AuthedRequest = Request & { user?: AuthUser; requestId?: string };

export const IS_PUBLIC = 'jandi:public';
export const ALLOW_GUEST = 'jandi:allowGuest';
export const ROLES = 'jandi:roles';
export const RATE_LIMIT = 'jandi:rateLimit';

/** Route does not require a session (a session is still resolved if present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Guest sessions may call this route (by default guests are rejected). */
export const AllowGuest = () => SetMetadata(ALLOW_GUEST, true);
/** Restrict to platform roles. ADMIN implicitly satisfies MODERATOR. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export interface RateLimitOptions {
  /** Bucket name, e.g. "auth:login". */
  name: string;
  limit: number;
  windowSec: number;
  by?: 'ip' | 'user';
}
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT, options);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
