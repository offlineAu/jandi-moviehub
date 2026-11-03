import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RateLimit } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidBody } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { TvMetadataService } from './tv.service';

const bodySchema = z
  .object({
    season: z.number().int().min(0).max(9999).optional(),
    episode: z.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (v) => (v.season === undefined) === (v.episode === undefined),
    'Season and episode must be provided together',
  );
const parseId = (raw: string) => {
  const parsed = z.coerce.number().int().positive().max(2147483647).safeParse(raw);
  if (!parsed.success) throw Errors.badRequest('INVALID_PARAMETER', 'Invalid TV identifier');
  return parsed.data;
};
@ApiTags('recent TV')
@Controller('recent-tv')
export class RecentTvController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tv: TvMetadataService,
  ) {}
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return {
      items: await this.prisma.recentTvSeries.findMany({
        where: { userId: user.id },
        orderBy: [{ viewedAt: 'desc' }, { tmdbId: 'asc' }],
        select: {
          tmdbId: true,
          title: true,
          posterUrl: true,
          viewedAt: true,
          season: true,
          episode: true,
        },
        take: 50,
      }),
    };
  }
  @Put(':id')
  @RateLimit({ name: 'recent-tv:record', limit: 60, windowSec: 60, by: 'user' })
  async record(
    @CurrentUser() user: AuthUser,
    @Param('id') raw: string,
    @ValidBody(bodySchema) body: z.infer<typeof bodySchema>,
  ) {
    const tmdbId = parseId(raw);
    const { series } = await this.tv.detail(tmdbId);
    if (body.season !== undefined && body.episode !== undefined) {
      // Validate the selected episode without marking it watched or recording playback progress.
      const { season } = await this.tv.season(tmdbId, body.season);
      if (!season.episodes.some((item) => item.number === body.episode))
        throw Errors.notFound('Episode');
    }
    const data = {
      title: series.title,
      posterUrl: series.posterUrl,
      viewedAt: new Date(),
      season: body.season ?? null,
      episode: body.episode ?? null,
    };
    await this.prisma.recentTvSeries.upsert({
      where: { userId_tmdbId: { userId: user.id, tmdbId } },
      create: { userId: user.id, tmdbId, ...data },
      update: data,
    });
    return { recorded: true };
  }
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') raw: string) {
    await this.prisma.recentTvSeries.deleteMany({
      where: { userId: user.id, tmdbId: parseId(raw) },
    });
  }
}
