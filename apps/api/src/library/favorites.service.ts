import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '@jandi/shared';
import { CatalogService } from '../catalog/catalog.service';
import { paginate } from '../catalog/catalog.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(userId: string, { page, pageSize }: PaginationQuery) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.favorite.count({ where: { userId } }),
      this.prisma.favorite.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { movieId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const movies = new Map(
      (
        await this.catalog.getSummaries(
          rows.map((r) => r.movieId),
          userId,
        )
      ).map((m) => [m.id, m]),
    );
    const items = rows
      .filter((r) => movies.has(r.movieId))
      .map((r) => ({ movie: movies.get(r.movieId)!, createdAt: r.createdAt }));
    return paginate(items, page, pageSize, total);
  }

  async add(userId: string, movieId: string) {
    await this.catalog.assertMovieExists(movieId);
    await this.prisma.favorite.upsert({
      where: { userId_movieId: { userId, movieId } },
      create: { userId, movieId },
      update: {},
    });
  }

  async remove(userId: string, movieId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, movieId } });
  }

  async isFavorite(userId: string, movieId: string) {
    return !!(await this.prisma.favorite.findUnique({
      where: { userId_movieId: { userId, movieId } },
    }));
  }
}
