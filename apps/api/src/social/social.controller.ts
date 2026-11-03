import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { friendRequestSchema } from '@jandi/shared';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, RateLimit } from '../common/auth-context';
import { ValidBody } from '../common/zod';
import { SocialService } from './social.service';

@ApiTags('friends')
@Controller('friends')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.social.listFriends(user);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthUser) {
    return this.social.requests(user);
  }

  @RateLimit({ name: 'friends:request', limit: 30, windowSec: 3600, by: 'user' })
  @Post('requests')
  send(
    @CurrentUser() user: AuthUser,
    @ValidBody(friendRequestSchema) body: z.infer<typeof friendRequestSchema>,
  ) {
    return this.social.sendRequest(user, body.username);
  }

  @HttpCode(204)
  @Post('requests/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.accept(user, id);
  }

  @HttpCode(204)
  @Post('requests/:id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.decline(user, id);
  }

  @HttpCode(204)
  @Delete('requests/:id')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.social.cancel(user, id);
  }

  @HttpCode(204)
  @Delete(':userId')
  remove(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.social.remove(user, userId);
  }
}
