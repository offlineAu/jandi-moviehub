import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { UsersModule } from '../users/users.module';
import { FavoritesService } from './favorites.service';
import { HistoryService } from './history.service';
import {
  FavoritesController,
  HistoryController,
  LibraryStatusController,
  WatchlistsController,
} from './library.controller';
import { WatchlistsService } from './watchlists.service';

@Module({
  imports: [CatalogModule, UsersModule],
  controllers: [
    FavoritesController,
    WatchlistsController,
    HistoryController,
    LibraryStatusController,
  ],
  providers: [FavoritesService, WatchlistsService, HistoryService],
  exports: [HistoryService, FavoritesService, WatchlistsService],
})
export class LibraryModule {}
