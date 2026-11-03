import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { messageQuerySchema, sendMessageSchema, type SendMessageInput } from '@jandi/shared';
import type { z } from 'zod';
import { AllowGuest, type AuthUser, CurrentUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidBody, ValidQuery } from '../common/zod';
import { ChatService } from './chat.service';

/** REST access to chat (history, plus a non-socket fallback for sending/deleting). */
@ApiTags('chat')
@AllowGuest()
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms/:roomId/messages')
  history(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @ValidQuery(messageQuerySchema) q: z.infer<typeof messageQuerySchema>,
  ) {
    return this.chat.history(user, roomId, q.before, q.limit);
  }

  @Post('rooms/:roomId/messages')
  async send(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @ValidBody(sendMessageSchema.omit({ roomId: true })) body: Omit<SendMessageInput, 'roomId'>,
  ) {
    if (!roomId) throw Errors.notFound('Room');
    return { message: await this.chat.send(user, { ...body, roomId }) };
  }

  @HttpCode(204)
  @Delete('messages/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.chat.remove(user, id);
  }
}
