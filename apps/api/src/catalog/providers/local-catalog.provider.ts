import { Injectable } from '@nestjs/common';
import type { MovieListQuery } from '@jandi/shared';
import type { Movie, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { playableMovieWhere } from '../playability';
import { type MovieProvider, type ProviderListResult, RELATED_LIMIT } from './movie-provider';

const startOfUtcDay = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Builds the Prisma filter + ordering for a list query against the local `movies` table. */
export function localListQuery(
  query: MovieListQuery,
  now = new Date(),
): { where: Prisma.MovieWhereInput; orderBy: Prisma.MovieOrderByWithRelationInput[] } {
  // The Jandi Originals are seeded as demo titles but are the catalog's only streamable films.
  // They are excluded from similar/recommendations (see `candidates`), not from the catalog
  // itself: a browse listing without them has nothing playable to show.
  const and: Prisma.MovieWhereInput[] = [];
  // Local mode lists the local catalog; `playable=true` lists every streamable title (any source).
  if (query.playable) and.push(playableMovieWhere(now));
  else and.push({ source: 'LOCAL' });
  if (query.playable === false) and.push({ NOT: playableMovieWhere(now) });
  if (query.genre) and.push({ genres: { some: { genre: { slug: query.genre.toLowerCase() } } } });
  if (query.q) {
    const q = query.q.replace(/[\\%_]/g, '\\$&'); // LIKE wildcards are matched literally
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { originalTitle: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (query.year) {
    and.push({
      releaseDate: {
        gte: new Date(Date.UTC(query.year, 0, 1)),
        lt: new Date(Date.UTC(query.year + 1, 0, 1)),
      },
    });
  }
  if (query.minRating !== undefined) and.push({ voteAverage: { gte: query.minRating } });

  const today = startOfUtcDay(now);
  let sort = query.sort;
  switch (query.category) {
    case 'recent':
      and.push({ releaseDate: { lte: today } });
      sort ??= 'release';
      break;
    case 'upcoming':
      and.push({ releaseDate: { gt: today } });
      break;
    case 'top-rated':
      and.push({ voteAverage: { not: null } });
      sort ??= 'rating';
      break;
    default:
      break;
  }

  const tiebreak: Prisma.MovieOrderByWithRelationInput[] = [{ title: 'asc' }, { id: 'asc' }];
  let orderBy: Prisma.MovieOrderByWithRelationInput[];
  if (query.category === 'upcoming' && !query.sort) {
    orderBy = [{ releaseDate: 'asc' }, ...tiebreak];
  } else if (sort === 'rating') {
    orderBy = [
      { voteAverage: { sort: 'desc', nulls: 'last' } },
      { popularity: 'desc' },
      ...tiebreak,
    ];
  } else if (sort === 'release') {
    orderBy = [{ releaseDate: { sort: 'desc', nulls: 'last' } }, ...tiebreak];
  } else if (sort === 'title') {
    orderBy = tiebreak;
  } else {
    orderBy = [{ popularity: 'desc' }, ...tiebreak];
  }
  return { where: { AND: and }, orderBy };
}

type Candidate = { id: string; popularity: number; genres: Array<{ genreId: string }> };

/**
 * Explainable related-title scoring:
 *   score = 3 × (genres shared with the seed title)
 *         + 2 × (viewer affinity: share of the candidate's genres the viewer favourited/watched, 0–1)
 *         + popularity rank bonus (0–1)
 */
export function scoreCandidates(
  seedGenreIds: Set<string>,
  candidates: Candidate[],
  affinity: Map<string, number> = new Map(),
): string[] {
  const maxAffinity = Math.max(1, ...affinity.values());
  const byPopularity = [...candidates].sort((a, b) => b.popularity - a.popularity);
  const popRank = new Map(
    byPopularity.map((c, i) => [c.id, 1 - i / Math.max(1, byPopularity.length)]),
  );
  return candidates
    .map((c) => {
      const genres = c.genres.map((g) => g.genreId);
      const shared = genres.filter((g) => seedGenreIds.has(g)).length;
      const aff = genres.length
        ? genres.reduce((s, g) => s + (affinity.get(g) ?? 0) / maxAffinity, 0) / genres.length
        : 0;
      return { id: c.id, score: 3 * shared + 2 * aff + (popRank.get(c.id) ?? 0) };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

/** Catalog backed by the local database (seeded demo catalog + admin-managed titles). */
@Injectable()
export class LocalCatalogProvider implements MovieProvider {
  readonly kind = 'local' as const;

  constructor(private readonly prisma: PrismaService) {}

  async list(query: MovieListQuery): Promise<ProviderListResult> {
    const { where, orderBy } = localListQuery(query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.movie.count({ where }),
      this.prisma.movie.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true },
      }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  async refresh(): Promise<void> {}

  async syncGenres(): Promise<void> {}

  async similar(movie: Movie): Promise<string[]> {
    const seed = await this.seedGenres(movie.id);
    if (!seed.size) return [];
    const candidates = await this.candidates(movie.id, seed);
    return scoreCandidates(seed, candidates).slice(0, RELATED_LIMIT);
  }

  async recommendations(movie: Movie, viewerId?: string): Promise<string[]> {
    const seed = await this.seedGenres(movie.id);
    const affinity = viewerId ? await this.viewerAffinity(viewerId) : new Map<string, number>();
    const genrePool = new Set([...seed, ...affinity.keys()]);
    let candidates = await this.candidates(movie.id, genrePool);
    if (viewerId) {
      const done = await this.prisma.watchHistory.findMany({
        where: { userId: viewerId, completed: true },
        select: { movieId: true },
      });
      const completed = new Set(done.map((d) => d.movieId));
      candidates = candidates.filter((c) => !completed.has(c.id));
    }
    if (candidates.length < RELATED_LIMIT) {
      // Top up with popular titles so the rail is never empty.
      const extra = await this.prisma.movie.findMany({
        where: {
          id: { notIn: [movie.id, ...candidates.map((c) => c.id)] },
          source: movie.source,
          isDemo: false,
        },
        orderBy: [{ popularity: 'desc' }, { id: 'asc' }],
        take: RELATED_LIMIT - candidates.length,
        select: { id: true, popularity: true, genres: { select: { genreId: true } } },
      });
      candidates = [...candidates, ...extra];
    }
    return scoreCandidates(seed, candidates, affinity).slice(0, RELATED_LIMIT);
  }

  private async seedGenres(movieId: string): Promise<Set<string>> {
    const rows = await this.prisma.movieGenre.findMany({
      where: { movieId },
      select: { genreId: true },
    });
    return new Set(rows.map((r) => r.genreId));
  }

  private candidates(excludeId: string, genreIds: Set<string>): Promise<Candidate[]> {
    if (!genreIds.size) return Promise.resolve([]);
    return this.prisma.movie.findMany({
      where: {
        id: { not: excludeId },
        isDemo: false,
        genres: { some: { genreId: { in: [...genreIds] } } },
      },
      orderBy: [{ popularity: 'desc' }, { id: 'asc' }],
      take: 200,
      select: { id: true, popularity: true, genres: { select: { genreId: true } } },
    });
  }

  /** Genre weights from the viewer's favourites (×2) and watch history (×1). */
  async viewerAffinity(userId: string): Promise<Map<string, number>> {
    const [favs, history] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId },
        take: 200,
        select: { movie: { select: { genres: { select: { genreId: true } } } } },
      }),
      this.prisma.watchHistory.findMany({
        where: { userId },
        orderBy: { lastWatchedAt: 'desc' },
        take: 200,
        select: { movie: { select: { genres: { select: { genreId: true } } } } },
      }),
    ]);
    const weights = new Map<string, number>();
    const add = (genreId: string, w: number) =>
      weights.set(genreId, (weights.get(genreId) ?? 0) + w);
    for (const f of favs) for (const g of f.movie.genres) add(g.genreId, 2);
    for (const h of history) for (const g of h.movie.genres) add(g.genreId, 1);
    return weights;
  }
}
