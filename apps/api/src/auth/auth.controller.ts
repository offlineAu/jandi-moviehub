import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  guestSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  verifyEmailSchema,
  type GuestInput,
  type LoginInput,
  type RegisterInput,
} from '@jandi/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import {
  AllowGuest,
  type AuthUser,
  clientIp,
  CurrentUser,
  Public,
  RateLimit,
} from '../common/auth-context';
import { ValidBody } from '../common/zod';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { SessionService } from './session.service';
import { SocketTicketService } from './socket-ticket.service';

const OAUTH_STATE_COOKIE = 'jandi_oauth_state';
const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly oauth: OAuthService,
    private readonly socketTickets: SocketTicketService,
  ) {}

  @AllowGuest()
  @RateLimit({ name: 'auth:socket-ticket', limit: 60, windowSec: 60, by: 'user' })
  @Post('socket-ticket')
  async socketTicket(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.socketTickets.issue(user.sessionId);
  }

  @Public()
  @RateLimit({ name: 'auth:register', limit: 10, windowSec: 3600 })
  @Post('register')
  async register(
    @ValidBody(registerSchema) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session } = await this.auth.register(body, meta(req));
    this.sessions.setCookie(res, session.token, session.expiresAt);
    const user = await this.sessions.resolve(session.token);
    return { user: await this.auth.me(user!) };
  }

  @Public()
  @RateLimit({ name: 'auth:login', limit: 10, windowSec: 300 })
  @HttpCode(200)
  @Post('login')
  async login(
    @ValidBody(loginSchema) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session } = await this.auth.login(body, meta(req));
    this.sessions.setCookie(res, session.token, session.expiresAt);
    const user = await this.sessions.resolve(session.token);
    return { user: await this.auth.me(user!) };
  }

  @Public()
  @RateLimit({ name: 'auth:guest', limit: 20, windowSec: 3600 })
  @Post('guest')
  async guest(
    @ValidBody(guestSchema) body: GuestInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session } = await this.auth.createGuest(body, meta(req));
    this.sessions.setCookie(res, session.token, session.expiresAt);
    const user = await this.sessions.resolve(session.token);
    return { user: await this.auth.me(user!) };
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user) await this.sessions.revoke(user.sessionId);
    this.sessions.clearCookie(res);
  }

  @AllowGuest()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { user: await this.auth.me(user) };
  }

  @RateLimit({ name: 'auth:verify-resend', limit: 3, windowSec: 3600, by: 'user' })
  @HttpCode(204)
  @Post('verify-email/resend')
  async resendVerification(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user);
  }

  @Public()
  @RateLimit({ name: 'auth:verify', limit: 20, windowSec: 3600 })
  @HttpCode(204)
  @Post('verify-email')
  async verifyEmail(@ValidBody(verifyEmailSchema) body: z.infer<typeof verifyEmailSchema>) {
    await this.auth.verifyEmail(body.token);
  }

  @Public()
  @RateLimit({ name: 'auth:reset-request', limit: 5, windowSec: 3600 })
  @HttpCode(202)
  @Post('password-reset/request')
  async requestReset(
    @ValidBody(passwordResetRequestSchema) body: { email: string },
    @Req() req: Request,
  ) {
    await this.auth.requestPasswordReset(body.email, meta(req));
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  @Public()
  @RateLimit({ name: 'auth:reset-confirm', limit: 10, windowSec: 3600 })
  @HttpCode(204)
  @Post('password-reset/confirm')
  async confirmReset(
    @ValidBody(passwordResetConfirmSchema) body: z.infer<typeof passwordResetConfirmSchema>,
    @Req() req: Request,
  ) {
    await this.auth.confirmPasswordReset(body.token, body.password, meta(req));
  }

  @RateLimit({ name: 'auth:change-password', limit: 5, windowSec: 900, by: 'user' })
  @HttpCode(204)
  @Post('password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @ValidBody(changePasswordSchema) body: z.infer<typeof changePasswordSchema>,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(user, body.currentPassword, body.newPassword, meta(req));
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthUser) {
    return { items: await this.auth.listSessions(user) };
  }

  @HttpCode(204)
  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.auth.revokeSession(user, id);
  }

  // ───────── OAuth ─────────

  @Public()
  @Get('oauth/providers')
  providers() {
    return { items: this.oauth.enabled() };
  }

  @Public()
  @RateLimit({ name: 'auth:oauth', limit: 30, windowSec: 600 })
  @Get('oauth/:provider/start')
  async oauthStart(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ) {
    const { url, state } = await this.oauth.start(provider, returnTo);
    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...this.sessions.cookieOptions(new Date(Date.now() + 600_000)),
    });
    res.redirect(302, url);
  }

  @Public()
  @RateLimit({ name: 'auth:oauth', limit: 30, windowSec: 600 })
  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { userId, returnTo } = await this.oauth.complete(
      provider,
      code,
      state,
      req.cookies?.[OAUTH_STATE_COOKIE],
    );
    res.clearCookie(OAUTH_STATE_COOKIE, { ...this.sessions.cookieOptions(), expires: undefined });
    const session = await this.sessions.create(userId, false, meta(req));
    this.sessions.setCookie(res, session.token, session.expiresAt);
    res.redirect(302, returnTo);
  }
}
