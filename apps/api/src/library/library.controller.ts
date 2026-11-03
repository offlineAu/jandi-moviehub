import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  addMovieSchema,
  createWatchlistSchema,
  type PaginationQuery,
  paginationSchema,
  progressSchema,
} from '@jandi/shared';
import type { z } from 'zod';
import { CatalogService } from '../catalog/catalog.service';
import { type AuthUser, CurrentUser, RateLimit } from '../common/auth-context';
import { ValidBody, ValidQuery } from '../common/zod';
import { FavoritesService } from './favorites.service';
import { HistoryService } from './history.service';
import {
  addWatchlistMemberSchema,
  type UpdateWatchlistInput,
  updateWatchlistSchema,
} from './library.schemas';
import { WatchlistsService } from './watchlists.service';

const uuid = new ParseUUIDPipe();

@ApiTags('library')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @ValidQuery(paginationSchema) query: PaginationQuery) {
    return this.favorites.list(user.id, query);
  }

  @HttpCode(204)
  @Put(':movieId')
  async add(@CurrentUser() user: AuthUser, @Param('movieId', uuid) movieId: string) {
    await this.favorites.add(user.id, movieId);
  }

  @HttpCode(204)
  @Delete(':movieId')
  async remove(@CurrentUser() user: AuthUser, @Param('movieId', uuid) movieId: string) {
    await this.favorites.remove(user.id, movieId);
  }
}

@ApiTags('library')
@Controller('watchlists')
export class WatchlistsController {
  constructor(private readonly watchlists: WatchlistsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.watchlists.list(user.id);
  }

  @RateLimit({ name: 'watchlists:create', limit: 30, windowSec: 600, by: 'user' })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @ValidBody(createWatchlistSchema) body: z.infer<typeof createWatchlistSchema>,
  ) {
    return this.watchlists.create(user.id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.watchlists.get(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @ValidBody(updateWatchlistSchema) body: UpdateWatchlistInput,
  ) {
    return this.watchlists.update(id, user.id, body);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    await this.watchlists.remove(id, user.id);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @ValidBody(addMovieSchema) body: z.infer<typeof addMovieSchema>,
  ) {
    return this.watchlists.addItem(id, user.id, body.movieId);
  }

  @HttpCode(204)
  @Delete(':id/items/:movieId')
  async removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('movieId', uuid) movieId: string,
  ) {
    await this.watchlists.removeItem(id, user.id, movieId);
  }

  @RateLimit({ name: 'watchlists:members', limit: 30, windowSec: 600, by: 'user' })
  @Post(':id/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @ValidBody(addWatchlistMemberSchema) body: z.infer<typeof addWatchlistMemberSchema>,
  ) {
    return this.watchlists.addMember(id, user.id, body.username);
  }

  @HttpCode(204)
  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
  ) {
    await this.watchlists.removeMember(id, user.id, userId);
  }
}

@ApiTags('library')
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @ValidQuery(paginationSchema) query: PaginationQuery) {
    return this.history.list(user.id, query);
  }

  @Get('continue')
  continueWatching(@CurrentUser() user: AuthUser) {
    return this.history.continueWatching(user.id);
  }

  @RateLimit({ name: 'history:progress', limit: 120, windowSec: 60, by: 'user' })
  @HttpCode(204)
  @Put('progress')
  async progress(
    @CurrentUser() user: AuthUser,
    @ValidBody(progressSchema) body: z.infer<typeof progressSchema>,
  ) {
    await this.history.recordProgress(user.id, body.movieId, body.positionSec, body.durationSec);
  }

  @HttpCode(204)
  @Delete(':movieId')
  async remove(@CurrentUser() user: AuthUser, @Param('movieId', uuid) movieId: string) {
    await this.history.remove(user.id, movieId);
  }

  @HttpCode(204)
  @Delete()
  async clear(@CurrentUser() user: AuthUser) {
    await this.history.clear(user.id);
  }
}

@ApiTags('library')
@Controller('movies')
export class LibraryStatusController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly favorites: FavoritesService,
    private readonly watchlists: WatchlistsService,
    private readonly history: HistoryService,
  ) {}

  @Get(':id/library-status')
  async status(@CurrentUser() user: AuthUser, @Param('id', uuid) movieId: string) {
    await this.catalog.assertMovieExists(movieId);
    const [favorite, watchlistIds, progress] = await Promise.all([
      this.favorites.isFavorite(user.id, movieId),
      this.watchlists.listIdsContaining(user.id, movieId),
      this.history.progressFor(user.id, movieId),
    ]);
    return { favorite, watchlistIds, progress };
  }
}
