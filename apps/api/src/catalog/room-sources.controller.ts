import { AnimeService } from '../anime/anime.service';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { externalSelectionSchema, type ExternalMedia } from '@jandi/shared';
import { AllowGuest, Public, RateLimit } from '../common/auth-context';
import { ValidBody, ValidQuery } from '../common/zod';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TvMetadataService } from './tv.service';
import { KisskhStreamService } from './kisskh-stream.service';
import { ExternalSeriesService } from './external-series.controller';
import { VidsrcService } from './vidsrc.service';
import { PlaybackPipelineService } from './playback-pipeline.service';

@Injectable()
export class ExternalMediaResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tv: TvMetadataService,
    private readonly vidsrc: VidsrcService,
    private readonly kisskhStream: KisskhStreamService,
    private readonly anime: AnimeService,
  ) {}
  async resolve(input: z.infer<typeof externalSelectionSchema>): Promise<ExternalMedia> {
    if (input.provider === 'anime') return this.anime.selection(input.sourceId);
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
    private readonly series: ExternalSeriesService,
    private readonly pipeline: PlaybackPipelineService,
  ) {}
  @RateLimit({ name: 'room-sources:candidates', limit: 60, windowSec: 60, by: 'user' })
  @Header('Cache-Control', 'private, no-store')
  @Get('candidates/movie/:id')
  candidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.pipeline.movie(id);
  }
  @RateLimit({ name: 'room-sources:episode-candidates', limit: 60, windowSec: 60, by: 'user' })
  @Header('Cache-Control', 'private, no-store')
  @Get('candidates/episode')
  episodeCandidates(
    @ValidQuery(
      z.object({
        tvId: z.coerce.number().int().min(1).max(2147483647),
        season: z.coerce.number().int().min(0).max(1000),
        episode: z.coerce.number().int().min(1).max(10000),
      }),
    )
    query: {
      tvId: number;
      season: number;
      episode: number;
    },
  ) {
    return this.pipeline.episode(query.tvId, query.season, query.episode);
  }
  @RateLimit({ name: 'room-sources:playback-event', limit: 30, windowSec: 60, by: 'user' })
  @Post('playback-event')
  @HttpCode(204)
  playbackEvent(
    @ValidBody(
      z
        .object({
          provider: z.enum(['local', 'kisskh-direct', 'vidsrc']),
          event: z.enum(['started', 'failed', 'buffering']),
          device: z.enum(['ios', 'android', 'desktop', 'other']),
          durationMs: z.number().int().min(0).max(600000).optional(),
        })
        .strict(),
    )
    body: {
      provider: 'local' | 'kisskh-direct' | 'vidsrc';
      event: 'started' | 'failed' | 'buffering';
      device: 'ios' | 'android' | 'desktop' | 'other';
      durationMs?: number;
    },
  ) {
    this.pipeline.record(body.provider, body.event, body.device, body.durationMs);
  }
  @Public()
  @Get('capabilities')
  capabilities() {
    return {
      vidsrcSync: this.vidsrc.enabled,
      kisskhDirectSync: this.kisskhStream.enabled,
      playbackPipeline: this.pipeline.enabled,
      anime: this.pipeline.animeEnabled,
    };
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
  @RateLimit({ name: 'room-sources:captions', limit: 120, windowSec: 60 })
  @Header('Content-Type', 'text/vtt; charset=utf-8')
  @Header('Cache-Control', 'private, max-age=300')
  @Get('kisskh/captions/:token')
  caption(@Param('token') token: string) {
    return this.kisskhStream.caption(token);
  }
  @AllowGuest()
  @RateLimit({ name: 'kisskh:solo', limit: 30, windowSec: 60, by: 'user' })
  @Header('Cache-Control', 'private, no-store')
  @Get('kisskh/movie/:id')
  async movie(@Param('id', ParseUUIDPipe) movieId: string) {
    const media = await this.resolver.resolve({
      provider: 'kisskh-direct',
      type: 'movie',
      movieId,
    });
    if (media.type !== 'movie') throw Errors.notFound('Movie');
    const [source, captions] = await Promise.all([
      this.kisskhStream.resolveMovie(media.tmdbId),
      this.kisskhStream.captions('movie', `tmdb:${media.tmdbId}`),
    ]);
    return {
      sources: [
        {
          assetId: `kisskh-direct:movie:${movieId}`,
          label: 'KissKH',
          ...source,
          durationSec: 0,
          captions,
          license: null,
        },
      ],
    };
  }

  @AllowGuest()
  @RateLimit({ name: 'kisskh:solo-episode', limit: 30, windowSec: 60, by: 'user' })
  @Header('Cache-Control', 'private, no-store')
  @Get('kisskh/episode')
  async episode(
    @ValidQuery(
      z.object({
        season: z.coerce.number().int().min(1).max(100),
        episode: z.coerce.number().int().min(1).max(1000),
        seriesId: z.coerce.number().int().positive().max(2147483647),
        episodeId: z.coerce.number().int().positive().max(2147483647),
      }),
    )
    query: {
      season: number;
      episode: number;
      seriesId: number;
      episodeId: number;
    },
  ) {
    const episode = {
      provider: 'kisskh-direct' as const,
      tvId: '71446' as const,
      numbering: 'provider' as const,
      ...query,
    };
    await this.series.resolveRoomEpisode(episode);
    const source = await this.kisskhStream.resolve(episode);
    const captions = await this.kisskhStream.captions(
      'series',
      `kisskh:${episode.seriesId}:1:${episode.episode}`,
    );
    return {
      sources: [
        {
          assetId: `kisskh-direct:71446:${episode.season}:${episode.episode}:${episode.seriesId}:${episode.episodeId}`,
          label: 'KissKH',
          ...source,
          durationSec: 0,
          captions,
          license: null,
        },
      ],
    };
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
