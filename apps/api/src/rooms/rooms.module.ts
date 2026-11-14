import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { UsersModule } from '../users/users.module';
import { RoomEvents } from './room-events';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [UsersModule, CatalogModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomEvents],
  exports: [RoomsService, RoomEvents],
})
export class RoomsModule {}
