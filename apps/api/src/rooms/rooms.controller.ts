import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  banSchema,
  createInviteSchema,
  createRoomSchema,
  type CreateRoomInput,
  joinRoomSchema,
  memberRoleSchema,
  roomQuerySchema,
  transferHostSchema,
  updateRoomSchema,
  type UpdateRoomInput,
} from '@jandi/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  AllowGuest,
  type AuthUser,
  clientIp,
  CurrentUser,
  Public,
  RateLimit,
} from '../common/auth-context';
import { ValidBody, ValidQuery } from '../common/zod';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@Controller()
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Public()
  @Get('rooms')
  discover(
    @CurrentUser() user: AuthUser | undefined,
    @ValidQuery(roomQuerySchema) q: z.infer<typeof roomQuerySchema>,
  ) {
    return this.rooms.listPublic(user, q.page, q.pageSize, q.q);
  }

  @AllowGuest()
  @Get('rooms/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.rooms.listMine(user);
  }

  @Get('rooms/friends')
  friends(@CurrentUser() user: AuthUser) {
    return this.rooms.listFriends(user);
  }

  @RateLimit({ name: 'rooms:create', limit: 20, windowSec: 3600, by: 'user' })
  @Post('rooms')
  async create(@CurrentUser() user: AuthUser, @ValidBody(createRoomSchema) body: CreateRoomInput) {
    return { room: await this.rooms.create(user, body) };
  }

  @Public()
  @RateLimit({ name: 'rooms:preview', limit: 60, windowSec: 60 })
  @Get('rooms/code/:code')
  preview(
    @CurrentUser() user: AuthUser | undefined,
    @Param('code') code: string,
    @Query('invite') invite?: string,
  ) {
    return this.rooms.previewByCode(code.slice(0, 16), user, invite);
  }

  @AllowGuest()
  @Get('rooms/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { room: await this.rooms.get(id, user) };
  }

  @Patch('rooms/:id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(updateRoomSchema) body: UpdateRoomInput,
  ) {
    return { room: await this.rooms.update(user, id, body) };
  }

  @HttpCode(204)
  @Delete('rooms/:id')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.rooms.close(user, id, { ip: clientIp(req) });
  }

  @AllowGuest()
  @RateLimit({ name: 'rooms:join', limit: 20, windowSec: 300, by: 'user' })
  @HttpCode(200)
  @Post('rooms/:id/join')
  async join(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(joinRoomSchema) body: z.infer<typeof joinRoomSchema>,
  ) {
    return { membership: await this.rooms.join(user, id, body) };
  }

  @AllowGuest()
  @HttpCode(204)
  @Post('rooms/:id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.leave(user, id);
  }

  @AllowGuest()
  @Get('rooms/:id/members')
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.members(id, user);
  }

  @HttpCode(204)
  @Patch('rooms/:id/members/:userId')
  setRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ValidBody(memberRoleSchema) body: z.infer<typeof memberRoleSchema>,
  ) {
    return this.rooms.setRole(user, id, userId, body.role);
  }

  @AllowGuest()
  @HttpCode(204)
  @Delete('rooms/:id/members/:userId')
  kick(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.rooms.kick(user, id, userId);
  }

  @Get('rooms/:id/bans')
  bans(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.bans(user, id);
  }

  @HttpCode(204)
  @Post('rooms/:id/bans/:userId')
  ban(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ValidBody(banSchema) body: z.infer<typeof banSchema>,
  ) {
    return this.rooms.kick(user, id, userId, { ban: true, reason: body.reason });
  }

  @HttpCode(204)
  @Delete('rooms/:id/bans/:userId')
  unban(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.rooms.unban(user, id, userId);
  }

  @HttpCode(204)
  @Post('rooms/:id/transfer')
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(transferHostSchema) body: z.infer<typeof transferHostSchema>,
  ) {
    return this.rooms.transferHost(user, id, body.userId);
  }

  @AllowGuest()
  @RateLimit({ name: 'rooms:invite', limit: 30, windowSec: 3600, by: 'user' })
  @Post('rooms/:id/invites')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(createInviteSchema) body: z.infer<typeof createInviteSchema>,
  ) {
    return this.rooms.createInvite(user, id, body);
  }

  @Get('rooms/:id/invites')
  invites(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.listInvites(user, id);
  }

  @HttpCode(204)
  @Delete('rooms/:id/invites/:inviteId')
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.rooms.revokeInvite(user, id, inviteId);
  }

  @Public()
  @RateLimit({ name: 'invites:resolve', limit: 30, windowSec: 60 })
  @Get('invites/:token')
  resolveInvite(@CurrentUser() user: AuthUser | undefined, @Param('token') token: string) {
    return this.rooms.resolveInvite(token.slice(0, 100), user);
  }
}
