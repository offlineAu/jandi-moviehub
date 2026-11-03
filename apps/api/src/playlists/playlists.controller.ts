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
  collaboratorSchema,
  createPlaylistSchema,
  paginationSchema,
  type PaginationQuery,
  reorderPlaylistSchema,
  updatePlaylistSchema,
} from '@jandi/shared';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, Public } from '../common/auth-context';
import { ValidBody, ValidQuery } from '../common/zod';
import { PlaylistsService } from './playlists.service';

@ApiTags('playlists')
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.playlists.listMine(user);
  }

  @Public()
  @Get('public')
  publicLists(
    @CurrentUser() user: AuthUser | undefined,
    @ValidQuery(paginationSchema) q: PaginationQuery,
  ) {
    return this.playlists.listPublic(q.page, q.pageSize, user?.id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @ValidBody(createPlaylistSchema) body: z.infer<typeof createPlaylistSchema>,
  ) {
    return { playlist: await this.playlists.create(user, body) };
  }

  @Post('from-series/:id')
  async fromSeries(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { playlist: await this.playlists.fromSeries(user, id) };
  }

  @Public()
  @Get(':id')
  async get(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return { playlist: await this.playlists.get(id, user?.id) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(updatePlaylistSchema) body: z.infer<typeof updatePlaylistSchema>,
  ) {
    return { playlist: await this.playlists.update(user, id, body) };
  }

  @HttpCode(204)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.playlists.remove(user, id);
  }

  @Post(':id/items')
  async addItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(addMovieSchema) body: z.infer<typeof addMovieSchema>,
  ) {
    return { playlist: await this.playlists.addItem(user, id, body.movieId) };
  }

  @Delete(':id/items/:itemId')
  async removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return { playlist: await this.playlists.removeItem(user, id, itemId) };
  }

  @Put(':id/order')
  async reorder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(reorderPlaylistSchema) body: z.infer<typeof reorderPlaylistSchema>,
  ) {
    return { playlist: await this.playlists.reorder(user, id, body.itemIds) };
  }

  @Post(':id/collaborators')
  async addCollaborator(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(collaboratorSchema) body: z.infer<typeof collaboratorSchema>,
  ) {
    return { playlist: await this.playlists.addCollaborator(user, id, body.username) };
  }

  @HttpCode(204)
  @Delete(':id/collaborators/:userId')
  removeCollaborator(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.playlists.removeCollaborator(user, id, userId);
  }

  @Post(':id/duplicate')
  async duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { playlist: await this.playlists.duplicate(user, id) };
  }
}
