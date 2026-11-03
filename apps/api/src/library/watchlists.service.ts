import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { FriendshipQuery } from '../users/friendship.query';
import { publicUser } from '../users/user-view';
import { MAX_WATCHLISTS_PER_USER, type UpdateWatchlistInput } from './library.schemas';

const userInclude = { profile: true } as const;
const watchlistInclude = {
  owner: { include: userInclude },
  members: { include: { user: { include: userInclude } }, orderBy: { createdAt: 'asc' } },
  items: {
    orderBy: { createdAt: 'desc' },
    take: 4,
    select: { movie: { select: { posterUrl: true } } },
  },
  _count: { select: { items: true } },
} satisfies Prisma.WatchlistInclude;

type WatchlistRow = Prisma.WatchlistGetPayload<{ include: typeof watchlistInclude }>;

const accessibleBy = (userId: string): Prisma.WatchlistWhereInput => ({
  OR: [{ ownerId: userId }, { members: { some: { userId } } }],
});

/**
 * Watchlists. Owners manage the list (rename, delete, members); members of a group list may
 * add and remove items. Lists the caller cannot access are reported as not found.
 */
@Injectable()
export class WatchlistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly friendships: FriendshipQuery,
  ) {}

  view(w: WatchlistRow) {
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      isDefault: w.isDefault,
      isGroup: w.isGroup,
      itemCount: w._count.items,
      owner: publicUser(w.owner),
      members: w.members.map((m) => publicUser(m.user)),
      previewPosters: w.items.map((i) => i.movie.posterUrl).filter((p): p is string => !!p),
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    };
  }

  private async load(id: string) {
    return this.prisma.watchlist.findUniqueOrThrow({ where: { id }, include: watchlistInclude });
  }

  /** The list if the user owns it or is a member; otherwise 404 (existence is not revealed). */
  private async accessible(id: string, userId: string) {
    const w = await this.prisma.watchlist.findFirst({ where: { id, ...accessibleBy(userId) } });
    if (!w) throw Errors.notFound('Watchlist');
    return w;
  }

  private async owned(id: string, userId: string) {
    const w = await this.accessible(id, userId);
    if (w.ownerId !== userId) throw Errors.forbidden('Only the owner can do that');
    return w;
  }

  async list(userId: string) {
    const rows = await this.prisma.watchlist.findMany({
      where: accessibleBy(userId),
      include: watchlistInclude,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map((w) => this.view(w)) };
  }

  async create(userId: string, input: { name: string; description?: string }) {
    const count = await this.prisma.watchlist.count({ where: { ownerId: userId } });
    if (count >= MAX_WATCHLISTS_PER_USER) {
      throw Errors.conflict(
        'WATCHLIST_LIMIT',
        `You can have at most ${MAX_WATCHLISTS_PER_USER} watchlists`,
      );
    }
    const created = await this.prisma.watchlist.create({
      data: { ownerId: userId, name: input.name, description: input.description || null },
    });
    return { watchlist: this.view(await this.load(created.id)) };
  }

  async get(id: string, userId: string) {
    await this.accessible(id, userId);
    const [w, items] = await Promise.all([
      this.load(id),
      this.prisma.watchlistItem.findMany({
        where: { watchlistId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: { addedBy: { include: userInclude } },
      }),
    ]);
    const movies = new Map(
      (
        await this.catalog.getSummaries(
          items.map((i) => i.movieId),
          userId,
        )
      ).map((m) => [m.id, m]),
    );
    return {
      watchlist: this.view(w),
      items: items
        .filter((i) => movies.has(i.movieId))
        .map((i) => ({
          id: i.id,
          movie: movies.get(i.movieId)!,
          addedBy: i.addedBy ? publicUser(i.addedBy) : null,
          createdAt: i.createdAt,
        })),
    };
  }

  async update(id: string, userId: string, input: UpdateWatchlistInput) {
    await this.owned(id, userId);
    await this.prisma.watchlist.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      },
    });
    return { watchlist: this.view(await this.load(id)) };
  }

  async remove(id: string, userId: string) {
    const w = await this.owned(id, userId);
    if (w.isDefault)
      throw Errors.conflict('DEFAULT_WATCHLIST', 'Your default watchlist cannot be deleted');
    await this.prisma.watchlist.delete({ where: { id } });
  }

  async addItem(id: string, userId: string, movieId: string) {
    await this.accessible(id, userId);
    await this.catalog.assertMovieExists(movieId);
    try {
      const item = await this.prisma.watchlistItem.create({
        data: { watchlistId: id, movieId, addedById: userId },
        include: { addedBy: { include: userInclude } },
      });
      await this.prisma.watchlist.update({ where: { id }, data: { updatedAt: new Date() } });
      return {
        item: {
          id: item.id,
          movie: (await this.catalog.getSummary(movieId))!,
          addedBy: item.addedBy ? publicUser(item.addedBy) : null,
          createdAt: item.createdAt,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict('ALREADY_IN_WATCHLIST', 'That movie is already on this watchlist');
      }
      throw error;
    }
  }

  async removeItem(id: string, userId: string, movieId: string) {
    await this.accessible(id, userId);
    await this.prisma.watchlistItem.deleteMany({ where: { watchlistId: id, movieId } });
  }

  async addMember(id: string, userId: string, username: string) {
    await this.owned(id, userId);
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target || target.isGuest || target.suspendedAt) throw Errors.notFound('User');
    if (target.id === userId)
      throw Errors.badRequest('INVALID_MEMBER', 'You already own this watchlist');
    if (!(await this.friendships.areFriends(userId, target.id))) {
      throw Errors.forbidden('You can only add friends to a group watchlist', 'NOT_FRIENDS');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.watchlistMember.create({ data: { watchlistId: id, userId: target.id } }),
        this.prisma.watchlist.update({ where: { id }, data: { isGroup: true } }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict('ALREADY_MEMBER', 'That user is already a member');
      }
      throw error;
    }
    return { watchlist: this.view(await this.load(id)) };
  }

  /** Owner removes a member, or a member leaves. */
  async removeMember(id: string, userId: string, memberId: string) {
    const w = await this.accessible(id, userId);
    if (w.ownerId !== userId && memberId !== userId)
      throw Errors.forbidden('Only the owner can remove other members');
    const { count } = await this.prisma.watchlistMember.deleteMany({
      where: { watchlistId: id, userId: memberId },
    });
    if (!count) throw Errors.notFound('Member');
    const remaining = await this.prisma.watchlistMember.count({ where: { watchlistId: id } });
    if (!remaining) await this.prisma.watchlist.update({ where: { id }, data: { isGroup: false } });
  }

  async listIdsContaining(userId: string, movieId: string): Promise<string[]> {
    const rows = await this.prisma.watchlist.findMany({
      where: { ...accessibleBy(userId), items: { some: { movieId } } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.id);
  }
}
