import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FriendshipQuery } from './friendship.query';
import { ProfilesController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CatalogModule],
  controllers: [ProfilesController, UsersController],
  providers: [UsersService, FriendshipQuery],
  exports: [FriendshipQuery, UsersService],
})
export class UsersModule {}
