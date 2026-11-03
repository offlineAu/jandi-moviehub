import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { marathonConfigSchema, type MarathonConfigInput, uuidSchema } from '@jandi/shared';
import { z } from 'zod';
import { AllowGuest, type AuthUser, CurrentUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidBody } from '../common/zod';
import { RoomsService } from '../rooms/rooms.service';
import { MarathonService } from './marathon.service';

const voteBody = z.object({ playlistItemId: uuidSchema });
const COMMANDS = {
  start: 'START',
  skip: 'SKIP',
  previous: 'PREVIOUS',
  stop: 'STOP',
  retry: 'RETRY',
} as const;

@ApiTags('marathon')
@Controller('rooms/:roomId/marathon')
export class MarathonController {
  constructor(
    private readonly marathon: MarathonService,
    private readonly rooms: RoomsService,
  ) {}

  @AllowGuest()
  @Get()
  async get(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    return { marathon: await this.marathon.snapshot(roomId, user.id) };
  }

  @Post()
  async configure(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @ValidBody(marathonConfigSchema) body: MarathonConfigInput,
  ) {
    return { marathon: await this.marathon.configure(user, roomId, body) };
  }

  @AllowGuest()
  @HttpCode(200)
  @Post('votes')
  async vote(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @ValidBody(voteBody) body: z.infer<typeof voteBody>,
  ) {
    return { marathon: await this.marathon.vote(user, roomId, body.playlistItemId) };
  }

  @HttpCode(200)
  @Post(':command')
  async command(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('command') command: string,
  ) {
    if (!Object.hasOwn(COMMANDS, command)) throw Errors.notFound('Marathon command');
    return {
      marathon: await this.marathon.command(
        user,
        roomId,
        COMMANDS[command as keyof typeof COMMANDS],
      ),
    };
  }

  @HttpCode(204)
  @Delete()
  remove(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.marathon.remove(user, roomId);
  }
}
