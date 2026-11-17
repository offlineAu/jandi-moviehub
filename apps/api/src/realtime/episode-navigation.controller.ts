import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { AllowGuest, CurrentUser, type AuthUser } from '../common/auth-context';
import { RoomsService } from '../rooms/rooms.service';
import { PlaybackService } from './playback.service';
import { EpisodeNavigationService } from './episode-navigation.service';

@Controller('rooms/:roomId')
export class EpisodeNavigationController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly playback: PlaybackService,
    private readonly navigation: EpisodeNavigationService,
  ) {}
  @AllowGuest()
  @Get('episode-navigation')
  @Header('Cache-Control', 'private, no-store')
  async get(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    return this.navigation.navigation(await this.playback.getState(roomId));
  }
}
