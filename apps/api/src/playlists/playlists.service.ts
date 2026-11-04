import { Injectable } from '@nestjs/common';
import type { PlaylistVisibility } from '@jandi/shared';
import type { Playlist, Prisma } from '@prisma/client';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { playableAssetWhere } from '../catalog/playability';
import { publicUser } from '../users/user-view';

interface PlaylistInput {
  name: string;
  description?: string;
  visibility: PlaylistVisibility;
  collaborative: boolean;
}

const playlistInclude = {
  owner: { include: { profile: true } },
  collaborators: { include: { user: { include: { profile: true } } } },
  items: {
    orderBy: { position: 'asc' },
    include: {
      addedBy: { include: { profile: true } },
      movie: {
        include: {
          genres: { include: { genre: true } },
          mediaAssets: { where: playableAssetWhere(), select: { durationSec: true }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.PlaylistInclude;
type PlaylistRow = Prisma.PlaylistGetPayload<{ include: typeof playlistInclude }>;

export type PlaylistAccess = 'owner' | 'collaborator' | 'viewer';

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaService) {}

  private access(
    p: Playlist & { collaborators: Array<{ userId: string }> },
    userId?: string,
  ): PlaylistAccess | null {
    if (userId && p.ownerId === userId) return 'owner';
    if (userId && p.collaborative && p.collaborators.some((c) => c.userId === userId))
      return 'collaborator';
    if (p.visibility === 'PUBLIC' || p.visibility === 'UNLISTED') return 'viewer';
    return null;
  }

  toDto(p: PlaylistRow, viewerId?: string) {
    const access = this.access(p, viewerId);
    const items = p.items.map((i) => {
      const playableDuration = i.movie.mediaAssets[0]?.durationSec ?? null;
      return {
        id: i.id,
        position: i.position,
        addedBy: i.addedBy ? publicUser(i.addedBy) : null,
        createdAt: i.createdAt,
        movie: {
          id: i.movie.id,
          title: i.movie.title,
          year: i.movie.releaseDate?.getUTCFullYear() ?? null,
          posterUrl: i.movie.posterUrl,
          backdropUrl: i.movie.backdropUrl,
          runtimeMin: i.movie.runtimeMin,
          genres: i.movie.genres.map((g) => g.genre.name),
          isDemo: i.movie.isDemo,
          playable: playableDuration != null,
        },
        durationSec: playableDuration ?? (i.movie.runtimeMin ? i.movie.runtimeMin * 60 : null),
      };
    });
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      visibility: p.visibility,
      collaborative: p.collaborative,
      owner: publicUser(p.owner),
      collaborators: p.collaborators.map((c) => publicUser(c.user)),
      items,
      itemCount: items.length,
      playableCount: items.filter((i) => i.movie.playable).length,
      totalRuntimeSec: items.reduce((sum, i) => sum + (i.durationSec ?? 0), 0),
      canEdit: access === 'owner' || access === 'collaborator',
      isOwner: access === 'owner',
      sharePath: `/playlists/${p.id}`,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private async load(id: string) {
    const p = await this.prisma.playlist.findUnique({ where: { id }, include: playlistInclude });
    if (!p) throw Errors.notFound('Playlist');
    return p;
  }

  /** Readable playlist (owner, collaborator, or public/unlisted) — private ones 404 for others. */
  async getReadable(id: string, viewerId?: string) {
    const p = await this.load(id);
    if (!this.access(p, viewerId)) throw Errors.notFound('Playlist');
    return p;
  }

  private async getEditable(id: string, userId: string, ownerOnly = false) {
    const p = await this.load(id);
    const access = this.access(p, userId);
    if (!access) throw Errors.notFound('Playlist');
    if (ownerOnly ? access !== 'owner' : access === 'viewer') throw Errors.forbidden();
    return p;
  }

  async listMine(user: AuthUser) {
    const rows = await this.prisma.playlist.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { collaborative: true, collaborators: { some: { userId: user.id } } },
        ],
      },
      include: playlistInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return { items: rows.map((p) => this.toDto(p, user.id)) };
  }

  async listPublic(page: number, pageSize: number, viewerId?: string) {
    const where = { visibility: 'PUBLIC' as const, items: { some: {} } };
    const [rows, total] = await Promise.all([
      this.prisma.playlist.findMany({
        where,
        include: playlistInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return {
      items: rows.map((p) => this.toDto(p, viewerId)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async get(id: string, viewerId?: string) {
    return this.toDto(await this.getReadable(id, viewerId), viewerId);
  }

  async create(user: AuthUser, input: PlaylistInput) {
    const p = await this.prisma.playlist.create({
      data: { ownerId: user.id, ...input },
      include: playlistInclude,
    });
    return this.toDto(p, user.id);
  }

  /** Snapshot the episode order into a private playlist for the existing room marathon engine. */
  async fromSeries(user: AuthUser, seriesId: string, fromMovieId?: string) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        episodes: {
          orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
          // Without a start point, 201 rows are enough to detect an over-long series.
          take: fromMovieId ? undefined : 201,
          select: { movieId: true },
        },
      },
    });
    if (!series) throw Errors.notFound('Series');
    if (!series.episodes.length)
      throw Errors.badRequest('EMPTY_SERIES', 'This series has no episodes');
    let episodes = series.episodes;
    if (fromMovieId) {
      const start = episodes.findIndex((episode) => episode.movieId === fromMovieId);
      if (start < 0) throw Errors.notFound('Episode');
      episodes = episodes.slice(start);
    }
    if (episodes.length > 200)
      throw Errors.conflict('PLAYLIST_FULL', 'Playlists hold up to 200 episodes');
    const playlist = await this.prisma.playlist.create({
      data: {
        ownerId: user.id,
        name: series.title.slice(0, 80),
        visibility: 'PRIVATE',
        items: {
          create: episodes.map((episode, position) => ({
            movieId: episode.movieId,
            position,
            addedById: user.id,
          })),
        },
      },
      include: playlistInclude,
    });
    return this.toDto(playlist, user.id);
  }

  async update(user: AuthUser, id: string, input: Partial<PlaylistInput>) {
    await this.getEditable(id, user.id, true);
    const p = await this.prisma.playlist.update({
      where: { id },
      data: input,
      include: playlistInclude,
    });
    return this.toDto(p, user.id);
  }

  async remove(user: AuthUser, id: string) {
    await this.getEditable(id, user.id, true);
    const active = await this.prisma.roomPlaylist.count({
      where: {
        playlistId: id,
        state: { in: ['COUNTDOWN', 'PLAYING', 'INTERMISSION', 'TRANSITIONING'] },
      },
    });
    if (active)
      throw Errors.conflict('PLAYLIST_IN_USE', 'This playlist is running in a marathon right now');
    await this.prisma.playlist.delete({ where: { id } });
  }

  async addItem(user: AuthUser, id: string, movieId: string) {
    const p = await this.getEditable(id, user.id);
    if (p.items.length >= 200)
      throw Errors.conflict('PLAYLIST_FULL', 'Playlists hold up to 200 movies');
    const movie = await this.prisma.movie.findUnique({ where: { id: movieId } });
    if (!movie) throw Errors.badRequest('INVALID_MOVIE', 'Movie not found');
    const position = (p.items.at(-1)?.position ?? -1) + 1;
    await this.prisma.playlistItem.create({
      data: { playlistId: id, movieId, position, addedById: user.id },
    });
    await this.prisma.playlist.update({ where: { id }, data: { updatedAt: new Date() } });
    return this.get(id, user.id);
  }

  async removeItem(user: AuthUser, id: string, itemId: string) {
    await this.getEditable(id, user.id);
    const { count } = await this.prisma.playlistItem.deleteMany({
      where: { id: itemId, playlistId: id },
    });
    if (!count) throw Errors.notFound('Playlist item');
    return this.get(id, user.id);
  }

  /** Reorders items; `itemIds` must be exactly the playlist's current item set. */
  async reorder(user: AuthUser, id: string, itemIds: string[]) {
    const p = await this.getEditable(id, user.id);
    const current = new Set(p.items.map((i) => i.id));
    if (
      itemIds.length !== current.size ||
      new Set(itemIds).size !== itemIds.length ||
      itemIds.some((i) => !current.has(i))
    ) {
      throw Errors.badRequest('INVALID_ORDER', 'Order must contain every item exactly once');
    }
    await this.prisma.$transaction(
      itemIds.map((itemId, position) =>
        this.prisma.playlistItem.update({ where: { id: itemId }, data: { position } }),
      ),
    );
    return this.get(id, user.id);
  }

  async addCollaborator(user: AuthUser, id: string, username: string) {
    await this.getEditable(id, user.id, true);
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target || target.isGuest) throw Errors.notFound('User');
    if (target.id === user.id)
      throw Errors.badRequest('INVALID_TARGET', 'You already own this playlist');
    await this.prisma.$transaction([
      this.prisma.playlistCollaborator.upsert({
        where: { playlistId_userId: { playlistId: id, userId: target.id } },
        create: { playlistId: id, userId: target.id },
        update: {},
      }),
      this.prisma.playlist.update({ where: { id }, data: { collaborative: true } }),
    ]);
    return this.get(id, user.id);
  }

  async removeCollaborator(user: AuthUser, id: string, userId: string) {
    const p = await this.load(id);
    if (p.ownerId !== user.id && userId !== user.id) throw Errors.forbidden();
    await this.prisma.playlistCollaborator.deleteMany({ where: { playlistId: id, userId } });
  }

  /** Copies a readable playlist into the viewer's library (playlist sharing). */
  async duplicate(user: AuthUser, id: string) {
    const source = await this.getReadable(id, user.id);
    const copy = await this.prisma.playlist.create({
      data: {
        ownerId: user.id,
        name: `${source.name} (copy)`.slice(0, 80),
        description: source.description,
        visibility: 'PRIVATE',
        items: {
          create: source.items.map((i, position) => ({
            movieId: i.movieId,
            position,
            addedById: user.id,
          })),
        },
      },
      include: playlistInclude,
    });
    return this.toDto(copy, user.id);
  }
}
