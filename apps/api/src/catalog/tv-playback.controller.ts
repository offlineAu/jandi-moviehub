import { Controller, Delete, Get, Header, HttpCode, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { type AuthUser, CurrentUser, Public, RateLimit, Roles } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidBody } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { playableAssetWhere } from './playability';
import { TvMetadataService } from './tv.service';

const integer = (s: string, min: number, max: number) => {
  const result = z.coerce.number().int().min(min).max(max).safeParse(s);
  if (!result.success) throw Errors.badRequest('INVALID_PARAMETER', 'Invalid episode identifier');
  return result.data;
};
const keys = (id: string, season: string, episode: string) => ({
  tmdbId: integer(id, 1, 2147483647),
  season: integer(season, 0, 9999),
  episode: integer(episode, 0, 9999),
});
const bodySchema = z.object({ movieId: z.uuid(), confirmed: z.literal(true) });
@ApiTags('TV playback')
@Controller()
export class TvPlaybackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly tv: TvMetadataService,
    private readonly audit: AuditService,
  ) {}
  private async linked(id: string, season: string, episode: string) {
    return this.prisma.tvEpisodeMedia.findUnique({
      where: { tmdbId_season_episode: keys(id, season, episode) },
    });
  }
  @Public()
  @Get('tv/:id/seasons/:season/episodes/:episode/availability')
  async availability(
    @Param('id') id: string,
    @Param('season') season: string,
    @Param('episode') episode: string,
  ) {
    const link = await this.linked(id, season, episode);
    const count = link
      ? await this.prisma.mediaAsset.count({
          where: { movieId: link.movieId, ...playableAssetWhere() },
        })
      : 0;
    return { playable: count > 0 };
  }
  @Get('tv/:id/seasons/:season/episodes/:episode/playback')
  @RateLimit({ name: 'tv:playback', limit: 120, windowSec: 60, by: 'user' })
  @Header('Cache-Control', 'no-store')
  async playback(
    @Param('id') id: string,
    @Param('season') season: string,
    @Param('episode') episode: string,
  ) {
    const link = await this.linked(id, season, episode);
    const sources = link ? await this.catalog.getPlaybackSources(link.movieId) : [];
    if (!sources.length) throw Errors.notFound('Playable episode');
    return { sources };
  }
  @Roles('ADMIN')
  @Put('admin/tv/:id/seasons/:season/episodes/:episode/media')
  async link(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Param('season') season: string,
    @Param('episode') episode: string,
    @ValidBody(bodySchema) body: z.infer<typeof bodySchema>,
  ) {
    const key = keys(id, season, episode);
    const metadata = await this.tv.season(key.tmdbId, key.season);
    if (!metadata.season.episodes.some((item) => item.number === key.episode))
      throw Errors.notFound('Episode');
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { movieId: body.movieId, ...playableAssetWhere() },
      select: { id: true },
    });
    if (!asset)
      throw Errors.badRequest(
        'NO_APPROVED_MEDIA',
        'Select a movie with approved media and a valid verified license',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.tvEpisodeMedia.upsert({
        where: { tmdbId_season_episode: key },
        create: { ...key, movieId: body.movieId },
        update: { movieId: body.movieId },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.tv_episode.media.link',
          targetType: 'movie',
          targetId: body.movieId,
          metadata: key,
        },
        tx,
      );
    });
    return { linked: true };
  }
  @Roles('ADMIN')
  @Delete('admin/tv/:id/seasons/:season/episodes/:episode/media')
  @HttpCode(204)
  async unlink(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Param('season') season: string,
    @Param('episode') episode: string,
  ) {
    const key = keys(id, season, episode);
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.tvEpisodeMedia.deleteMany({ where: key });
      if (!result.count) throw Errors.notFound('Episode media');
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.tv_episode.media.unlink',
          targetType: 'tv_episode',
          metadata: key,
        },
        tx,
      );
    });
  }
}
