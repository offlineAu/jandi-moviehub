import { Logger } from '@nestjs/common';
import type { MovieListQuery } from '@jandi/shared';
import { type Movie, Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { type LocalCatalogProvider } from './local-catalog.provider';
import { type MovieProvider, type ProviderListResult, RELATED_LIMIT } from './movie-provider';
import type { TmdbClient } from './tmdb.client';
import { mapDetails, mapListItem, slugify } from './tmdb.mapper';
import type { TmdbGenre, TmdbMovieDetails, TmdbMovieListItem, TmdbPage } from './tmdb.types';

export const TMDB_PAGE_SIZE = 20;
export const TMDB_MAX_PAGE = 500;
export const DETAILS_APPEND = 'credits,videos,similar,recommendations';

export interface TmdbListRequest {
  path: string;
  params: Record<string, string | number | undefined>;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Maps a catalog query to a TMDB v3 endpoint. Plain categories use the curated lists
 * (trending/day, popular, now_playing, upcoming, top_rated); filters/sorts use /discover;
 * free text uses /search.
 */
export function buildListRequest(
  query: MovieListQuery,
  tmdbGenreId: number | undefined,
  now = new Date(),
): TmdbListRequest {
  const base = { include_adult: 'false', language: 'en-US' };
  if (query.q) {
    return {
      path: '/search/movie',
      params: { ...base, query: query.q, primary_release_year: query.year },
    };
  }
  const filtered = !!(query.genre || query.year || query.minRating !== undefined || query.sort);
  if (!filtered) {
    const curated: Record<string, string> = {
      trending: '/trending/movie/day',
      popular: '/movie/popular',
      recent: '/movie/now_playing',
      upcoming: '/movie/upcoming',
      'top-rated': '/movie/top_rated',
    };
    return { path: curated[query.category ?? 'popular']!, params: { language: 'en-US' } };
  }
  const params: Record<string, string | number | undefined> = {
    ...base,
    include_video: 'false',
    with_genres: tmdbGenreId,
    primary_release_year: query.year,
  };
  if (query.minRating !== undefined) {
    params['vote_average.gte'] = query.minRating;
    params['vote_count.gte'] = 50;
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (query.category === 'recent') {
    params['primary_release_date.lte'] = isoDay(today);
    params['primary_release_date.gte'] = isoDay(new Date(today.getTime() - 60 * 86_400_000));
  } else if (query.category === 'upcoming') {
    params['primary_release_date.gte'] = isoDay(new Date(today.getTime() + 86_400_000));
  }
  const sortBy =
    query.sort ??
    (query.category === 'top-rated'
      ? 'rating'
      : query.category === 'recent'
        ? 'release'
        : undefined);
  switch (sortBy) {
    case 'rating':
      params.sort_by = 'vote_average.desc';
      params['vote_count.gte'] = Math.max(Number(params['vote_count.gte'] ?? 0), 200);
      break;
    case 'release':
      params.sort_by = 'primary_release_date.desc';
      params['primary_release_date.lte'] ??= isoDay(today);
      break;
    case 'title':
      params.sort_by = 'title.asc';
      break;
    default:
      params.sort_by =
        query.category === 'upcoming' ? 'primary_release_date.asc' : 'popularity.desc';
  }
  return { path: '/discover/movie', params };
}

/** TMDB pages (20 items each) covering our `page`/`pageSize` window. */
export function tmdbPageWindow(page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  const first = Math.floor(start / TMDB_PAGE_SIZE) + 1;
  const last = Math.floor((start + pageSize - 1) / TMDB_PAGE_SIZE) + 1;
  return { start, first, last, offset: start - (first - 1) * TMDB_PAGE_SIZE };
}

/**
 * Live TMDB catalog. Every TMDB title that is listed is upserted into `movies` (by `tmdbId`)
 * so it has a stable internal UUID for watchlists, rooms and playlists.
 */
export class TmdbProvider implements MovieProvider {
  readonly kind = 'tmdb' as const;
  private readonly logger = new Logger('TmdbProvider');
  private genresSyncedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: TmdbClient,
    private readonly cacheTtlSec: number,
    private readonly local: LocalCatalogProvider,
  ) {}

  async syncGenres(force = false): Promise<void> {
    if (!force && Date.now() - this.genresSyncedAt < this.cacheTtlSec * 1000) return;
    const { genres } = await this.client.get<{ genres: TmdbGenre[] }>('/genre/movie/list', {
      language: 'en-US',
    });
    for (const g of genres) await this.upsertGenre(g);
    this.genresSyncedAt = Date.now();
  }

  private async upsertGenre(g: TmdbGenre) {
    const byTmdb = await this.prisma.genre.findUnique({ where: { tmdbId: g.id } });
    if (byTmdb) {
      if (byTmdb.name !== g.name) {
        await this.prisma.genre
          .update({ where: { id: byTmdb.id }, data: { name: g.name } })
          .catch(() => undefined);
      }
      return;
    }
    const byName = await this.prisma.genre.findFirst({
      where: { name: { equals: g.name, mode: 'insensitive' } },
    });
    if (byName) {
      await this.prisma.genre.update({ where: { id: byName.id }, data: { tmdbId: g.id } });
      return;
    }
    let slug = slugify(g.name) || `genre-${g.id}`;
    if (await this.prisma.genre.findUnique({ where: { slug } })) slug = `${slug}-${g.id}`;
    await this.prisma.genre
      .create({ data: { tmdbId: g.id, name: g.name, slug } })
      .catch((e: unknown) => {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      });
  }

  /** TMDB genre id → internal genre id; re-syncs once if TMDB references a genre we have not stored. */
  private async genreIdMap(needed: number[] = []): Promise<Map<number, string>> {
    await this.syncGenres();
    const load = async () => {
      const rows = await this.prisma.genre.findMany({
        where: { tmdbId: { not: null } },
        select: { id: true, tmdbId: true },
      });
      return new Map(rows.map((r) => [r.tmdbId!, r.id]));
    };
    let map = await load();
    if (needed.some((g) => !map.has(g))) {
      await this.syncGenres(true);
      map = await load();
    }
    return map;
  }

  /** Upserts list items (refreshing rows older than the cache TTL) and returns their UUIDs in order. */
  async upsertItems(items: TmdbMovieListItem[]): Promise<string[]> {
    const visible = items.filter((i) => !i.adult && typeof i.id === 'number' && i.title);
    if (!visible.length) return [];
    const existing = await this.prisma.movie.findMany({
      where: { tmdbId: { in: visible.map((i) => i.id) } },
      select: { id: true, tmdbId: true, updatedAt: true },
    });
    const byTmdb = new Map(existing.map((e) => [e.tmdbId!, e]));
    const staleBefore = Date.now() - this.cacheTtlSec * 1000;
    const needsWrite = visible.filter((i) => {
      const row = byTmdb.get(i.id);
      return !row || row.updatedAt.getTime() < staleBefore;
    });
    if (needsWrite.length) {
      const genreMap = await this.genreIdMap(needsWrite.flatMap((i) => i.genre_ids ?? []));
      for (const item of needsWrite) {
        const data = mapListItem(item);
        const genreIds = (item.genre_ids ?? [])
          .map((g) => genreMap.get(g))
          .filter((g): g is string => !!g);
        const row = await this.upsertMovie(item.id, data, item.genre_ids ? genreIds : undefined);
        byTmdb.set(item.id, { id: row.id, tmdbId: item.id, updatedAt: new Date() });
      }
    }
    return visible.map((i) => byTmdb.get(i.id)?.id).filter((id): id is string => !!id);
  }

  private async upsertMovie(
    tmdbId: number,
    data: ReturnType<typeof mapListItem>,
    genreIds?: string[],
  ) {
    const genres = genreIds
      ? { deleteMany: {}, create: genreIds.map((genreId) => ({ genreId })) }
      : undefined;
    const run = () =>
      this.prisma.movie.upsert({
        where: { tmdbId },
        create: {
          ...(data as Prisma.MovieCreateInput),
          genres: genreIds ? { create: genreIds.map((genreId) => ({ genreId })) } : undefined,
        },
        update: { ...data, genres },
        select: { id: true },
      });
    try {
      return await run();
    } catch (error) {
      // Concurrent first-time upserts of the same title: retry once as an update.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return run();
      throw error;
    }
  }

  async list(query: MovieListQuery, viewerId?: string): Promise<ProviderListResult> {
    if (query.playable) return this.local.list(query); // availability is local knowledge
    let tmdbGenreId: number | undefined;
    if (query.genre) {
      await this.syncGenres();
      const genre = await this.prisma.genre.findUnique({
        where: { slug: query.genre.toLowerCase() },
      });
      if (!genre?.tmdbId) return { ids: [], total: 0 };
      tmdbGenreId = genre.tmdbId;
    }
    const request = buildListRequest(query, tmdbGenreId);
    const window = tmdbPageWindow(query.page, query.pageSize);
    if (window.first > TMDB_MAX_PAGE) return { ids: [], total: 0 };

    const collected: TmdbMovieListItem[] = [];
    let totalResults = 0;
    let totalPages = 1;
    for (let p = window.first; p <= Math.min(window.last, TMDB_MAX_PAGE); p++) {
      if (p > window.first && p > totalPages) break;
      const page = await this.client.get<TmdbPage>(request.path, { ...request.params, page: p });
      totalResults = page.total_results;
      totalPages = page.total_pages;
      collected.push(...page.results);
      if (p >= page.total_pages) break;
    }
    void viewerId;
    const slice = collected.slice(window.offset, window.offset + query.pageSize);
    const ids = await this.upsertItems(slice);
    const total = Math.min(totalResults, Math.min(totalPages, TMDB_MAX_PAGE) * TMDB_PAGE_SIZE);
    return { ids, total };
  }

  private details(movie: Movie): Promise<TmdbMovieDetails> {
    return this.client.get<TmdbMovieDetails>(`/movie/${movie.tmdbId}`, {
      language: 'en-US',
      append_to_response: DETAILS_APPEND,
    });
  }

  /** Pulls full details (runtime, cast, trailers, genres) when stored metadata is missing or stale. */
  async refresh(movie: Movie): Promise<void> {
    if (!movie.tmdbId) return;
    const fresh =
      movie.metadataSyncedAt &&
      Date.now() - movie.metadataSyncedAt.getTime() < this.cacheTtlSec * 1000;
    if (fresh) return;
    let details: TmdbMovieDetails;
    try {
      details = await this.details(movie);
    } catch (error) {
      // We still have the stored (real, previously fetched) metadata; serve that.
      this.logger.warn(`Could not refresh TMDB ${movie.tmdbId}: ${(error as Error).message}`);
      return;
    }
    const genreMap = await this.genreIdMap((details.genres ?? []).map((g) => g.id)).catch(
      () => new Map<number, string>(),
    );
    const genreIds = (details.genres ?? [])
      .map((g) => genreMap.get(g.id))
      .filter((g): g is string => !!g);
    await this.prisma.movie.update({
      where: { id: movie.id },
      data: {
        ...mapDetails(details),
        genres: { deleteMany: {}, create: genreIds.map((genreId) => ({ genreId })) },
      },
    });
  }

  async similar(movie: Movie, viewerId?: string): Promise<string[]> {
    if (!movie.tmdbId) return this.local.similar(movie);
    void viewerId;
    const details = await this.details(movie);
    return (await this.upsertItems(details.similar?.results ?? [])).slice(0, RELATED_LIMIT);
  }

  async recommendations(movie: Movie, viewerId?: string): Promise<string[]> {
    if (!movie.tmdbId) return this.local.recommendations(movie, viewerId);
    const details = await this.details(movie);
    return (await this.upsertItems(details.recommendations?.results ?? [])).slice(0, RELATED_LIMIT);
  }
}
