import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowGuest, type AuthUser, CurrentUser } from '../common/auth-context';
import { CatalogService } from '../catalog/catalog.service';
import { RoomsService } from '../rooms/rooms.service';
import { PlaybackService } from './playback.service';

@ApiTags('rooms')
@Controller('rooms/:roomId')
export class RealtimeController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly playback: PlaybackService,
    private readonly catalog: CatalogService,
  ) {}

  /** Current authoritative playback state (REST fallback for the socket snapshot). */
  @AllowGuest()
  @Get('playback-state')
  async state(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    return { state: await this.playback.getState(roomId), serverTime: Date.now() };
  }

  /**
   * Signed sources for the room's current movie. The asset that defines the room timeline is
   * listed first; other renditions (e.g. HLS for Safari) share the same duration.
   */
  @AllowGuest()
  @Get('playback-sources')
  async sources(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    const state = await this.playback.getState(roomId);
    if (!state.movieId) return { movieId: null, sources: [] };
    const sources = await this.catalog.getPlaybackSources(state.movieId);
    sources.sort(
      (a, b) => Number(b.assetId === state.mediaAssetId) - Number(a.assetId === state.mediaAssetId),
    );
    return { movieId: state.movieId, movie: await this.catalog.getSummary(state.movieId), sources };
  }
}
