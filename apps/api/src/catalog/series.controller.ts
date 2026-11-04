import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { type AuthUser, CurrentUser, Public, Roles } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidBody, ValidQuery } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { playableAssetWhere } from './playability';
import { lookupCommons, searchCommons } from './commons-search';
import { TvMetadataService } from './tv.service';

const seriesInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  country: z.string().trim().max(80).default(''),
});
const seriesUpdate = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    country: z.string().trim().max(80).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field');
const seriesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  country: z.string().trim().max(80).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  genre: z.string().trim().min(1).max(100).optional(),
  year: z.coerce.number().int().min(1870).max(2100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const episodeInput = z.object({
  movieId: z.uuid(),
  seasonNumber: z.number().int().min(1).max(999),
  episodeNumber: z.number().int().min(1).max(9999),
});
const episodePosition = z.object({
  seasonNumber: z.number().int().min(1).max(999),
  episodeNumber: z.number().int().min(1).max(9999),
});

/** Episode movie fields for navigation, with current license-backed playability. */
const episodeMovie = () =>
  ({
    select: {
      id: true,
      title: true,
      mediaAssets: { where: playableAssetWhere(), select: { id: true }, take: 1 },
    },
  }) as const;

@ApiTags('series')
@Controller()
export class SeriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tv: TvMetadataService,
  ) {}

  @Public()
  @Get('series')
  async list(@ValidQuery(seriesQuery) query: z.infer<typeof seriesQuery>) {
    const episodeMovie: Prisma.MovieWhereInput = {
      ...(query.language
        ? { originalLanguage: { equals: query.language, mode: 'insensitive' } }
        : {}),
      ...(query.genre ? { genres: { some: { genre: { slug: query.genre } } } } : {}),
      ...(query.year
        ? {
            releaseDate: {
              gte: new Date(Date.UTC(query.year, 0, 1)),
              lt: new Date(Date.UTC(query.year + 1, 0, 1)),
            },
          }
        : {}),
    };
    const where: Prisma.SeriesWhereInput = {
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
      ...(query.country
        ? { country: { equals: query.country, mode: 'insensitive' as const } }
        : {}),
      ...(query.language || query.genre || query.year
        ? { episodes: { some: { movie: episodeMovie } } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.series.findMany({
        where,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * 24,
        take: 24,
        include: { _count: { select: { episodes: true } } },
      }),
      this.prisma.series.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...item }) => ({ ...item, episodeCount: _count.episodes })),
      page: query.page,
      pageSize: 24,
      total,
      totalPages: Math.max(1, Math.ceil(total / 24)),
    };
  }

  @Public()
  @Get('series/:id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const series = await this.prisma.series.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
          include: {
            movie: {
              select: {
                id: true,
                title: true,
                runtimeMin: true,
                mediaAssets: { where: playableAssetWhere(), select: { id: true }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!series) throw Errors.notFound('Series');
    return {
      series: {
        ...series,
        episodes: series.episodes.map(({ movie, ...episode }) => ({
          ...episode,
          movie: {
            id: movie.id,
            title: movie.title,
            runtimeMin: movie.runtimeMin,
            playable: movie.mediaAssets.length > 0,
          },
        })),
      },
    };
  }

  /**
   * Previous/next episode for a movie that is a series episode. Local series take precedence;
   * otherwise an admin-linked TMDB TV episode is navigated across the other linked episodes of
   * the same show (unlinked episodes have no authorized media, so they are never offered).
   */
  @Public()
  @Get('movies/:id/series-navigation')
  async navigation(@Param('id', ParseUUIDPipe) id: string) {
    const movie = episodeMovie();
    const current = await this.prisma.seriesEpisode.findUnique({
      where: { movieId: id },
      include: { series: { select: { id: true, title: true } } },
    });
    if (!current) return { navigation: await this.tvNavigation(id, movie) };
    const [previous, next] = await Promise.all([
      this.prisma.seriesEpisode.findFirst({
        where: {
          seriesId: current.seriesId,
          OR: [
            { seasonNumber: { lt: current.seasonNumber } },
            { seasonNumber: current.seasonNumber, episodeNumber: { lt: current.episodeNumber } },
          ],
        },
        orderBy: [{ seasonNumber: 'desc' }, { episodeNumber: 'desc' }],
        include: { movie },
      }),
      this.prisma.seriesEpisode.findFirst({
        where: {
          seriesId: current.seriesId,
          OR: [
            { seasonNumber: { gt: current.seasonNumber } },
            { seasonNumber: current.seasonNumber, episodeNumber: { gt: current.episodeNumber } },
          ],
        },
        orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
        include: { movie },
      }),
    ]);
    const item = (episode: typeof next) =>
      episode && {
        movieId: episode.movie.id,
        title: episode.movie.title,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        playable: episode.movie.mediaAssets.length > 0,
      };
    return {
      navigation: {
        kind: 'series' as const,
        series: current.series,
        current: { seasonNumber: current.seasonNumber, episodeNumber: current.episodeNumber },
        previous: item(previous),
        next: item(next),
      },
    };
  }

  private async tvNavigation(movieId: string, movie: ReturnType<typeof episodeMovie>) {
    const current = await this.prisma.tvEpisodeMedia.findFirst({
      where: { movieId },
      orderBy: [{ tmdbId: 'asc' }, { season: 'asc' }, { episode: 'asc' }],
    });
    if (!current) return null;
    const [previous, next, title] = await Promise.all([
      this.prisma.tvEpisodeMedia.findFirst({
        where: {
          tmdbId: current.tmdbId,
          OR: [
            { season: { lt: current.season } },
            { season: current.season, episode: { lt: current.episode } },
          ],
        },
        orderBy: [{ season: 'desc' }, { episode: 'desc' }],
        include: { movie },
      }),
      this.prisma.tvEpisodeMedia.findFirst({
        where: {
          tmdbId: current.tmdbId,
          OR: [
            { season: { gt: current.season } },
            { season: current.season, episode: { gt: current.episode } },
          ],
        },
        orderBy: [{ season: 'asc' }, { episode: 'asc' }],
        include: { movie },
      }),
      // Title is cosmetic; TMDB may be unconfigured or down.
      this.tv
        .detail(current.tmdbId)
        .then(({ series }) => series.title)
        .catch(() => null),
    ]);
    const item = (episode: typeof next) =>
      episode && {
        movieId: episode.movie.id,
        title: episode.movie.title,
        seasonNumber: episode.season,
        episodeNumber: episode.episode,
        playable: episode.movie.mediaAssets.length > 0,
      };
    return {
      kind: 'tv' as const,
      series: { id: String(current.tmdbId), title: title ?? 'TV series' },
      current: { seasonNumber: current.season, episodeNumber: current.episode },
      previous: item(previous),
      next: item(next),
    };
  }

  @Roles('ADMIN')
  @Get('admin/source-candidates/commons')
  async sourceCandidates(
    @ValidQuery(z.object({ q: z.string().trim().min(2).max(100) })) query: { q: string },
  ) {
    return { items: await searchCommons(query.q) };
  }

  @Roles('ADMIN')
  @Get('admin/source-candidates')
  async candidateQueue(
    @ValidQuery(z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }))
    query: {
      page: number;
    },
  ) {
    const [items, total] = await Promise.all([
      this.prisma.sourceCandidate.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * 24,
        take: 24,
      }),
      this.prisma.sourceCandidate.count(),
    ]);
    return {
      items: items.map(({ sizeBytes, ...item }) => ({
        ...item,
        sizeBytes: sizeBytes?.toString() ?? null,
      })),
      page: query.page,
      totalPages: Math.max(1, Math.ceil(total / 24)),
      total,
    };
  }

  @Roles('ADMIN')
  @Post('admin/source-candidates/commons')
  async saveCandidate(
    @CurrentUser() actor: AuthUser,
    @ValidBody(z.object({ pageId: z.number().int().positive().max(2147483647) }))
    body: { pageId: number },
  ) {
    const candidate = await lookupCommons(body.pageId);
    if (!candidate) throw Errors.notFound('Source video');
    const source = 'WIKIMEDIA_COMMONS';
    const externalId = String(candidate.id);
    const result = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.sourceCandidate.createMany({
        skipDuplicates: true,
        data: [
          {
            source,
            externalId,
            title: candidate.title,
            sourceUrl: candidate.sourceUrl,
            mimeType: candidate.mime,
            sizeBytes: candidate.sizeBytes === null ? null : BigInt(candidate.sizeBytes),
            license: candidate.license,
            artist: candidate.artist,
            licenseUrl: candidate.licenseUrl,
          },
        ],
      });
      const row = await tx.sourceCandidate.findUniqueOrThrow({
        where: { source_externalId: { source, externalId } },
      });
      if (inserted.count)
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'admin.source_candidate.add',
            targetType: 'source_candidate',
            targetId: row.id,
            metadata: { source, externalId },
          },
          tx,
        );
      return { row, created: inserted.count === 1 };
    });
    const { sizeBytes, ...row } = result.row;
    return {
      candidate: { ...row, sizeBytes: sizeBytes?.toString() ?? null },
      created: result.created,
    };
  }

  @Roles('ADMIN')
  @Delete('admin/source-candidates/:id')
  @HttpCode(204)
  async removeCandidate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.sourceCandidate.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.source_candidate.remove',
          targetType: 'source_candidate',
          targetId: id,
          metadata: { source: candidate.source, externalId: candidate.externalId },
        },
        tx,
      );
    });
  }

  @Roles('ADMIN')
  @Post('admin/series')
  async create(
    @CurrentUser() actor: AuthUser,
    @ValidBody(seriesInput) body: z.infer<typeof seriesInput>,
  ) {
    const series = await this.prisma.$transaction(async (tx) => {
      const row = await tx.series.create({ data: body });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.series.create',
          targetType: 'series',
          targetId: row.id,
        },
        tx,
      );
      return row;
    });
    return { series };
  }

  @Roles('ADMIN')
  @Patch('admin/series/:id')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(seriesUpdate) body: z.infer<typeof seriesUpdate>,
  ) {
    const series = await this.prisma.$transaction(async (tx) => {
      const row = await tx.series.update({ where: { id }, data: body });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.series.update',
          targetType: 'series',
          targetId: id,
          metadata: body,
        },
        tx,
      );
      return row;
    });
    return { series };
  }

  @Roles('ADMIN')
  @Delete('admin/series/:id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.series.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.series.delete',
          targetType: 'series',
          targetId: id,
          metadata: { title: row.title },
        },
        tx,
      );
    });
  }

  @Roles('ADMIN')
  @Patch('admin/series/:id/episodes/:episodeId')
  async updateEpisode(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
    @ValidBody(episodePosition) body: z.infer<typeof episodePosition>,
  ) {
    const episode = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.seriesEpisode.findFirst({ where: { id: episodeId, seriesId: id } });
      if (!existing) throw Errors.notFound('Episode');
      const row = await tx.seriesEpisode.update({ where: { id: episodeId }, data: body });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.series.episode.update',
          targetType: 'series',
          targetId: id,
          metadata: {
            episodeId,
            from: { seasonNumber: existing.seasonNumber, episodeNumber: existing.episodeNumber },
            to: body,
          },
        },
        tx,
      );
      return row;
    });
    return { episode };
  }

  @Roles('ADMIN')
  @Delete('admin/series/:id/episodes/:episodeId')
  @HttpCode(204)
  async removeEpisode(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.seriesEpisode.findFirst({ where: { id: episodeId, seriesId: id } });
      if (!row) throw Errors.notFound('Episode');
      await tx.seriesEpisode.delete({ where: { id: episodeId } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.series.episode.remove',
          targetType: 'series',
          targetId: id,
          metadata: {
            episodeId,
            movieId: row.movieId,
            seasonNumber: row.seasonNumber,
            episodeNumber: row.episodeNumber,
          },
        },
        tx,
      );
    });
  }

  @Roles('ADMIN')
  @Post('admin/series/:id/episodes')
  async addEpisode(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(episodeInput) body: z.infer<typeof episodeInput>,
  ) {
    const [series, movie, occupied, movieAssigned] = await Promise.all([
      this.prisma.series.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.movie.findUnique({ where: { id: body.movieId }, select: { id: true } }),
      this.prisma.seriesEpisode.findUnique({
        where: {
          seriesId_seasonNumber_episodeNumber: {
            seriesId: id,
            seasonNumber: body.seasonNumber,
            episodeNumber: body.episodeNumber,
          },
        },
      }),
      this.prisma.seriesEpisode.findUnique({ where: { movieId: body.movieId } }),
    ]);
    if (!series) throw Errors.notFound('Series');
    if (!movie) throw Errors.notFound('Movie');
    if (occupied || movieAssigned)
      throw Errors.conflict('EPISODE_EXISTS', 'Episode number or movie is already assigned');
    const episode = await this.prisma.$transaction(async (tx) => {
      const row = await tx.seriesEpisode.create({ data: { seriesId: id, ...body } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.series.episode.add',
          targetType: 'series',
          targetId: id,
          metadata: body,
        },
        tx,
      );
      return row;
    });
    return { episode };
  }
}
