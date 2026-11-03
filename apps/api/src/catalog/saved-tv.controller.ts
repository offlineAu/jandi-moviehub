import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RateLimit } from '../common/auth-context';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TvMetadataService } from './tv.service';

const idSchema = z.coerce.number().int().positive().max(2147483647);
function parseId(raw: string) {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw Errors.badRequest('INVALID_PARAMETER', 'Invalid TV identifier');
  return parsed.data;
}
@ApiTags('TV watchlist')
@Controller('saved-tv')
export class SavedTvController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tv: TvMetadataService,
  ) {}
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const items = await this.prisma.savedTvSeries.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { tmdbId: true, title: true, posterUrl: true, createdAt: true },
    });
    return { items };
  }
  @Put(':id')
  @RateLimit({ name: 'saved-tv:add', limit: 60, windowSec: 60, by: 'user' })
  async add(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const tmdbId = parseId(id);
    const { series } = await this.tv.detail(tmdbId);
    const item = await this.prisma.savedTvSeries.upsert({
      where: { userId_tmdbId: { userId: user.id, tmdbId } },
      create: { userId: user.id, tmdbId, title: series.title, posterUrl: series.posterUrl },
      update: { title: series.title, posterUrl: series.posterUrl },
    });
    return {
      item: {
        tmdbId: item.tmdbId,
        title: item.title,
        posterUrl: item.posterUrl,
        createdAt: item.createdAt,
      },
    };
  }
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.savedTvSeries.deleteMany({ where: { userId: user.id, tmdbId: parseId(id) } });
  }
}
