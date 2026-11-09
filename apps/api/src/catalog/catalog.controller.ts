import { VidsrcService } from './vidsrc.service';
import { Controller, Get, Header, HttpStatus, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type MovieListQuery, movieListQuerySchema } from '@jandi/shared';
import type { Response } from 'express';
import { type AuthUser, CurrentUser, Public, RateLimit } from '../common/auth-context';
import { AppError, Errors } from '../common/errors';
import { ValidQuery } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { ARTWORK_FILE, type ArtworkKind, artworkUrl, renderArtwork } from './artwork';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly vidsrc: VidsrcService,
  ) {}

  @Public()
  @Get('catalog/info')
  info() {
    return this.catalog.info();
  }

  @Public()
  @RateLimit({ name: 'catalog:list', limit: 240, windowSec: 60 })
  @Get('movies')
  list(@ValidQuery(movieListQuerySchema) query: MovieListQuery, @CurrentUser() user?: AuthUser) {
    return this.catalog.list(query, user?.id);
  }

  @Public()
  @Get('genres')
  genres() {
    return this.catalog.genres();
  }

  @Public()
  @Get('movies/:id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { movie: await this.catalog.detail(id) };
  }

  @Public()
  @RateLimit({ name: 'catalog:external-source', limit: 60, windowSec: 60 })
  @Get('movies/:id/external-source')
  async externalSource(@Param('id', ParseUUIDPipe) id: string) {
    const movie = await this.prisma.movie.findUnique({ where: { id }, select: { tmdbId: true } });
    if (!movie) throw Errors.notFound('Movie');
    if (!movie.tmdbId) return { available: false, embedUrl: null };
    const media = {
      provider: 'vidsrc' as const,
      type: 'movie' as const,
      movieId: id,
      tmdbId: movie.tmdbId,
    };
    const available = await this.vidsrc.listed(media);
    return {
      available,
      embedUrl: available ? `https://vidsrc.sh/embed/movie/${movie.tmdbId}` : null,
    };
  }

  @Public()
  @Get('movies/:id/similar')
  async similar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return { items: await this.catalog.similar(id, user?.id) };
  }

  @Public()
  @Get('movies/:id/recommendations')
  async recommendations(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return { items: await this.catalog.recommendations(id, user?.id) };
  }

  @RateLimit({ name: 'catalog:playback', limit: 120, windowSec: 60, by: 'user' })
  @Header('Cache-Control', 'no-store')
  @Get('movies/:id/playback')
  async playback(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalog.assertMovieExists(id);
    const sources = await this.catalog.getPlaybackSources(id);
    if (!sources.length) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        'NOT_PLAYABLE',
        'This title has no licensed media available to stream',
      );
    }
    return { sources };
  }

  /** Generated artwork for local titles (only for movies that reference it). */
  @Public()
  @Get('catalog/artwork/:file')
  async artwork(@Param('file') file: string, @Res() res: Response) {
    const match = ARTWORK_FILE.exec(file);
    if (!match) throw Errors.notFound('Artwork');
    const [, slug, kind] = match as unknown as [string, string, ArtworkKind];
    const url = artworkUrl(slug, kind);
    const movie = await this.prisma.movie.findFirst({
      where: kind === 'poster' ? { posterUrl: url } : { backdropUrl: url },
      include: { genres: { include: { genre: true } } },
    });
    if (!movie) throw Errors.notFound('Artwork');
    const svg = renderArtwork({
      slug,
      kind,
      title: movie.title,
      year: movie.releaseDate?.getUTCFullYear() ?? null,
      genres: movie.genres.map((g) => g.genre.name).sort(),
    });
    res
      .status(200)
      .type('image/svg+xml; charset=utf-8')
      .set('Cache-Control', 'public, max-age=86400')
      .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .send(svg);
  }
}
