import { Inject, Injectable } from '@nestjs/common';
import type { MovieListQuery } from '@jandi/shared';
import type { ContentLicense, Genre, MediaAsset, Movie, MovieGenre } from '@prisma/client';
import { basename } from 'node:path';
import { Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CastMember,
  type MovieDetail,
  type MovieSummary,
  type Paginated,
  type PlaybackSource,
  type StoredCaption,
  type Trailer,
  paginate,
  TMDB_ATTRIBUTION,
  TMDB_ATTRIBUTION_URL,
} from './catalog.types';
import { CAPTIONS_DIR, MediaSigner } from './media-signer';
import { FORMAT_ORDER, isAssetPlayable, playableAssetWhere } from './playability';
import type { MovieProvider } from './providers/movie-provider';

export const MOVIE_PROVIDER = Symbol('MOVIE_PROVIDER');

export type MovieWithGenres = Movie & { genres: Array<MovieGenre & { genre: Genre }> };
type AssetWithLicense = MediaAsset & { license: ContentLicense };

const genresInclude = { genres: { include: { genre: true } } } as const;

const CAPTION_LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export function storedCaptions(value: unknown): StoredCaption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is StoredCaption =>
      !!c &&
      typeof c === 'object' &&
      typeof (c as StoredCaption).lang === 'string' &&
      CAPTION_LANG.test((c as StoredCaption).lang) &&
      typeof (c as StoredCaption).storageKey === 'string',
  );
}

const sortAssets = <T extends { format: string; createdAt: Date }>(assets: T[]) =>
  [...assets].sort(
    (a, b) =>
      (FORMAT_ORDER[a.format] ?? 9) - (FORMAT_ORDER[b.format] ?? 9) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );

/**
 * Catalog read model shared by every feature that shows or plays movies
 * (library, rooms, playlists, marathons). Exported from CatalogModule.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly signer: MediaSigner,
    @Inject(MOVIE_PROVIDER) private readonly provider: MovieProvider,
  ) {}

  get providerKind() {
    return this.provider.kind;
  }

  info() {
    return this.provider.kind === 'tmdb'
      ? {
          provider: 'tmdb' as const,
          label: 'TMDB',
          attribution: TMDB_ATTRIBUTION,
          attributionUrl: TMDB_ATTRIBUTION_URL,
        }
      : {
          provider: 'local' as const,
          label: 'Demo catalog',
          attribution:
            'Local demo catalog: Jandi Originals are generated demonstration films; other titles are public-domain or Creative Commons works listed with factual metadata. Artwork is generated.',
          attributionUrl: null,
        };
  }

  // ───────── DTO mapping ─────────

  toSummary(movie: MovieWithGenres, playable: boolean): MovieSummary {
    const releaseDate = movie.releaseDate ? movie.releaseDate.toISOString().slice(0, 10) : null;
    return {
      id: movie.id,
      title: movie.title,
      year: movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null,
      releaseDate,
      overview: movie.overview,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      voteAverage: movie.voteAverage,
      runtimeMin: movie.runtimeMin,
      genres: movie.genres.map((g) => g.genre.name).sort((a, b) => a.localeCompare(b)),
      playable,
      isDemo: movie.isDemo,
      source: movie.source,
    };
  }

  /** Movie ids that currently have a playable asset. */
  async playableIds(movieIds: string[]): Promise<Set<string>> {
    if (!movieIds.length) return new Set();
    const rows = await this.prisma.mediaAsset.findMany({
      where: { movieId: { in: movieIds }, ...playableAssetWhere() },
      select: { movieId: true },
      distinct: ['movieId'],
    });
    return new Set(rows.map((r) => r.movieId));
  }

  /** Summaries in the order of `ids` (unknown ids are dropped, duplicates kept). */
  async getSummaries(ids: string[], _viewerId?: string): Promise<MovieSummary[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const [movies, playable] = await Promise.all([
      this.prisma.movie.findMany({ where: { id: { in: unique } }, include: genresInclude }),
      this.playableIds(unique),
    ]);
    const byId = new Map(movies.map((m) => [m.id, this.toSummary(m, playable.has(m.id))]));
    return ids.map((id) => byId.get(id)).filter((m): m is MovieSummary => !!m);
  }

  async getSummary(id: string): Promise<MovieSummary | null> {
    return (await this.getSummaries([id]))[0] ?? null;
  }

  async isPlayable(movieId: string): Promise<boolean> {
    return (await this.playableIds([movieId])).has(movieId);
  }

  async assertMovieExists(movieId: string): Promise<void> {
    const found = await this.prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true },
    });
    if (!found) throw Errors.notFound('Movie');
  }

  // ───────── Browse ─────────

  async list(query: MovieListQuery, viewerId?: string): Promise<Paginated<MovieSummary>> {
    const { ids, total } = await this.provider.list(query, viewerId);
    return paginate(await this.getSummaries(ids, viewerId), query.page, query.pageSize, total);
  }

  async genres() {
    await this.provider.syncGenres().catch(() => undefined); // stored genres are still valid if TMDB is down
    const where = this.provider.kind === 'local' ? { movies: { some: {} } } : {};
    const items = await this.prisma.genre.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
    return { items };
  }

  private async findMovie(id: string): Promise<Movie> {
    const movie = await this.prisma.movie.findUnique({ where: { id } });
    if (!movie) throw Errors.notFound('Movie');
    return movie;
  }

  async detail(id: string): Promise<MovieDetail> {
    let movie = await this.findMovie(id);
    if (movie.source === 'TMDB' && this.provider.kind === 'tmdb') {
      await this.provider.refresh(movie);
      movie = await this.findMovie(id);
    }
    const full = await this.prisma.movie.findUniqueOrThrow({
      where: { id },
      include: { ...genresInclude, mediaAssets: { include: { license: true } } },
    });
    const playableAssets = sortAssets(full.mediaAssets.filter((a) => isAssetPlayable(a)));
    const primary = playableAssets[0];
    return {
      ...this.toSummary(full, playableAssets.length > 0),
      tagline: full.tagline,
      originalTitle: full.originalTitle,
      originalLanguage: full.originalLanguage,
      voteCount: full.voteCount,
      cast: (Array.isArray(full.cast) ? full.cast : []) as unknown as CastMember[],
      trailers: (Array.isArray(full.trailers) ? full.trailers : []) as unknown as Trailer[],
      media: playableAssets.map((a) => ({
        id: a.id,
        label: a.label,
        format: a.format,
        durationSec: a.durationSec,
      })),
      license: primary
        ? {
            type: primary.license.type,
            licensor: primary.license.licensor,
            attribution: primary.license.attribution,
          }
        : null,
      attribution: full.attribution,
    };
  }

  async similar(id: string, viewerId?: string): Promise<MovieSummary[]> {
    const movie = await this.findMovie(id);
    return this.getSummaries(await this.provider.similar(movie, viewerId), viewerId);
  }

  async recommendations(id: string, viewerId?: string): Promise<MovieSummary[]> {
    const movie = await this.findMovie(id);
    return this.getSummaries(await this.provider.recommendations(movie, viewerId), viewerId);
  }

  // ───────── Playback ─────────

  /** The file inside the asset that a player should open first. */
  static entryFile(asset: Pick<MediaAsset, 'format' | 'storageKey'>): string {
    return asset.format === 'HLS' ? 'index.m3u8' : basename(asset.storageKey);
  }

  toPlaybackSource(asset: AssetWithLicense, exp = this.signer.expiry()): PlaybackSource {
    return {
      assetId: asset.id,
      label: asset.label,
      format: asset.format,
      mimeType: asset.mimeType,
      durationSec: asset.durationSec,
      url: this.signer.url(asset.id, CatalogService.entryFile(asset), exp),
      captions: storedCaptions(asset.captions).map((c) => ({
        lang: c.lang,
        label: c.label || c.lang,
        url: this.signer.url(asset.id, `${CAPTIONS_DIR}/${c.lang}.vtt`, exp),
      })),
      license: { type: asset.license.type, attribution: asset.license.attribution },
    };
  }

  /** Signed sources for every playable asset of a movie (WebM first). Empty when not playable. */
  async getPlaybackSources(movieId: string): Promise<PlaybackSource[]> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { movieId, ...playableAssetWhere() },
      include: { license: true },
    });
    const exp = this.signer.expiry();
    return sortAssets(assets).map((a) => this.toPlaybackSource(a, exp));
  }

  /** A signed source for one asset, or null if it is missing or not currently playable. */
  async getPlaybackSourceForAsset(assetId: string): Promise<PlaybackSource | null> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { license: true },
    });
    if (!asset || !isAssetPlayable(asset)) return null;
    return this.toPlaybackSource(asset);
  }

  // ───────── Runtime ─────────

  /**
   * Runtime in seconds per movie: the primary playable asset's exact duration when there is one,
   * otherwise the catalog runtime (minutes × 60), otherwise null.
   */
  async getRuntimesSec(movieIds: string[]): Promise<Map<string, number | null>> {
    const unique = [...new Set(movieIds)];
    const result = new Map<string, number | null>();
    if (!unique.length) return result;
    const [movies, assets] = await Promise.all([
      this.prisma.movie.findMany({
        where: { id: { in: unique } },
        select: { id: true, runtimeMin: true },
      }),
      this.prisma.mediaAsset.findMany({
        where: { movieId: { in: unique }, ...playableAssetWhere() },
        select: { movieId: true, format: true, durationSec: true, createdAt: true },
      }),
    ]);
    for (const m of movies) result.set(m.id, m.runtimeMin ? m.runtimeMin * 60 : null);
    for (const id of unique) {
      const primary = sortAssets(assets.filter((a) => a.movieId === id))[0];
      if (primary) result.set(id, primary.durationSec);
    }
    return result;
  }

  /** Total runtime of a sequence of movies (duplicates count each time); unknown runtimes count as 0. */
  async totalRuntimeSec(movieIds: string[]): Promise<{ totalSec: number; unknown: number }> {
    const runtimes = await this.getRuntimesSec(movieIds);
    let totalSec = 0;
    let unknown = 0;
    for (const id of movieIds) {
      const sec = runtimes.get(id);
      if (sec == null) unknown += 1;
      else totalSec += sec;
    }
    return { totalSec: Math.round(totalSec * 1000) / 1000, unknown };
  }

  get mediaUrlTtlSec() {
    return this.config.env.MEDIA_URL_TTL_SEC;
  }
}
