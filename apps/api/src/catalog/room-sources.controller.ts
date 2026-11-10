import { Controller, Get, HttpCode, Injectable, Post } from '@nestjs/common';
import { z } from 'zod';
import { externalSelectionSchema, type ExternalMedia } from '@jandi/shared';
import { AllowGuest, Public, RateLimit } from '../common/auth-context';
import { ValidQuery } from '../common/zod';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TvMetadataService } from './tv.service';
import { KisskhStreamService } from './kisskh-stream.service';
import { VidsrcService } from './vidsrc.service';

@Injectable()
export class ExternalMediaResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tv: TvMetadataService,
    private readonly vidsrc: VidsrcService,
    private readonly kisskhStream: KisskhStreamService,
  ) {}
  async resolve(input: z.infer<typeof externalSelectionSchema>): Promise<ExternalMedia> {
    if (input.provider === 'vidsrc') this.vidsrc.assertEnabled();
    else this.kisskhStream.assertEnabled();
    let media: ExternalMedia;
    if (input.type === 'movie') {
      const movie = await this.prisma.movie.findUnique({
        where: { id: input.movieId },
        select: { tmdbId: true },
      });
      if (!movie?.tmdbId) throw Errors.notFound('Movie source');
      media = { ...input, tmdbId: movie.tmdbId };
    } else {
      const result = await this.tv.episode(input.tvId, input.season, input.episode);
      if (!result.episode) throw Errors.notFound('Episode');
      media = { ...input, tmdbId: input.tvId };
    }
    if (media.provider === 'kisskh-direct') await this.kisskhStream.resolveMovie(media.tmdbId);
    else if (!(await this.vidsrc.listed(media))) throw Errors.notFound('Provider source');
    return media;
  }
}

@Controller('room-sources')
export class RoomSourcesController {
  constructor(
    private readonly vidsrc: VidsrcService,
    private readonly resolver: ExternalMediaResolver,
    private readonly kisskhStream: KisskhStreamService,
  ) {}
  @Public()
  @Get('capabilities')
  capabilities() {
    return { vidsrcSync: this.vidsrc.enabled, kisskhDirectSync: this.kisskhStream.enabled };
  }
  @AllowGuest()
  @RateLimit({ name: 'room-sources:warm', limit: 10, windowSec: 60, by: 'user' })
  @Post('kisskh/warm')
  @HttpCode(202)
  warmKisskh() {
    this.kisskhStream.warm();
    return { starting: true };
  }
  @Public()
  @RateLimit({ name: 'room-sources:check', limit: 120, windowSec: 60, by: 'user' })
  @Get('check')
  async check(
    @ValidQuery(
      z
        .object({
          movieId: z.uuid().optional(),
          provider: z.enum(['vidsrc', 'kisskh-direct']).default('vidsrc'),
          tvId: z.coerce.number().int().positive().max(2147483647).optional(),
          season: z.coerce.number().int().min(0).max(1000).optional(),
          episode: z.coerce.number().int().min(1).max(10000).optional(),
        })
        .refine((v) =>
          v.movieId
            ? !v.tvId && v.season === undefined && v.episode === undefined
            : !!v.tvId && v.season !== undefined && v.episode !== undefined,
        ),
    )
    query: {
      movieId?: string;
      provider?: 'vidsrc' | 'kisskh-direct';
      tvId?: number;
      season?: number;
      episode?: number;
    },
  ) {
    try {
      await this.resolver.resolve(
        query.movieId
          ? { provider: query.provider ?? 'vidsrc', type: 'movie', movieId: query.movieId }
          : {
              provider: 'vidsrc',
              type: 'tv',
              tvId: query.tvId!,
              season: query.season!,
              episode: query.episode!,
            },
      );
      return { listed: true, playbackConfirmed: false };
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.getStatus() === 404 || error.code === 'KISSKH_DIRECT_NO_STREAM')
      )
        return { listed: false, playbackConfirmed: false };
      throw error;
    }
  }
}
