import { Module } from '@nestjs/common';
import { PlaylistsModule } from '../playlists/playlists.module';
import { PlaybackModule } from '../realtime/playback.module';
import { RoomsModule } from '../rooms/rooms.module';
import { MarathonController } from './marathon.controller';
import { MarathonService } from './marathon.service';

@Module({
  imports: [RoomsModule, PlaybackModule, PlaylistsModule],
  controllers: [MarathonController],
  providers: [MarathonService],
  exports: [MarathonService],
})
export class MarathonModule {}
