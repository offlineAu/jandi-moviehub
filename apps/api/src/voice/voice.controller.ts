import { Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowGuest, type AuthUser, CurrentUser, Public, RateLimit } from '../common/auth-context';
import { VoiceService } from './voice.service';

@ApiTags('voice')
@Controller()
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Public()
  @Get('voice/status')
  status() {
    return { configured: this.voice.configured };
  }

  /** LiveKit access token for an active member of the room (guests included). */
  @AllowGuest()
  @RateLimit({ name: 'voice:token', limit: 30, windowSec: 60, by: 'user' })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Post('rooms/:roomId/voice-token')
  token(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.voice.issueToken(user, roomId);
  }
}
