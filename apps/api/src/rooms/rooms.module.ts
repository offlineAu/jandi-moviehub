import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RoomEvents } from './room-events';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [UsersModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomEvents],
  exports: [RoomsService, RoomEvents],
})
export class RoomsModule {}
