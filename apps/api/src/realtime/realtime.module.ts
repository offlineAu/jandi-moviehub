import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ChatModule } from '../chat/chat.module';
import { LibraryModule } from '../library/library.module';
import { MarathonModule } from '../marathon/marathon.module';
import { RoomsModule } from '../rooms/rooms.module';
import { PlaybackModule } from './playback.module';
import { PresenceService } from './presence.service';
import { RealtimeController } from './realtime.controller';
import { RoomGateway } from './room.gateway';

@Module({
  imports: [RoomsModule, PlaybackModule, ChatModule, MarathonModule, CatalogModule, LibraryModule],
  controllers: [RealtimeController],
  providers: [RoomGateway, PresenceService],
  exports: [PresenceService],
})
export class RealtimeModule {}
