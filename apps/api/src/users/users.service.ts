import { Injectable, Logger } from '@nestjs/common';
import { preferencesSchema, type VisibilityLevel } from '@jandi/shared';
import type { Prisma } from '@prisma/client';
import { randomToken } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { sniffImage } from './avatar';
import { FriendshipQuery, type FriendshipStatus } from './friendship.query';
import type { ProfilePatchInput } from './profile.schemas';
import { avatarUrl, publicUser } from './user-view';

const RELATED_LIMIT = 12;

export function canView(
  level: VisibilityLevel,
  isSelf: boolean,
  friendship: FriendshipStatus,
): boolean {
  if (isSelf) return true;
  if (level === 'PUBLIC') return true;
  if (level === 'FRIENDS') return friendship === 'friends';
  return false;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly friendships: FriendshipQuery,
    private readonly catalog: CatalogService,
  ) {}

  async updateProfile(userId: string, input: ProfilePatchInput) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { profile: true },
      });
      const data: Prisma.UserProfileUpdateInput = {};
      if (input.displayName !== undefined) data.displayName = input.displayName;
      if (input.bio !== undefined) data.bio = input.bio === '' ? null : input.bio;
      if (input.preferences) {
        const stored = user.profile?.preferences;
        const base = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        const merged = preferencesSchema.safeParse({ ...base, ...input.preferences });
        data.preferences = (
          merged.success ? merged.data : preferencesSchema.parse(input.preferences)
        ) as Prisma.InputJsonValue;
      }
      if (input.privacy) {
        const p = input.privacy;
        if (p.profileVisibility !== undefined) data.profileVisibility = p.profileVisibility;
        if (p.watchHistoryVisibility !== undefined)
          data.watchHistoryVisibility = p.watchHistoryVisibility;
        if (p.showOnlineStatus !== undefined) data.showOnlineStatus = p.showOnlineStatus;
        if (p.discoverable !== undefined) data.discoverable = p.discoverable;
      }
      await tx.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          displayName: input.displayName ?? user.username,
          ...(data as Omit<Prisma.UserProfileCreateInput, 'user' | 'displayName'>),
        },
        update: data,
      });
    });
  }

  // ───────── Avatars ─────────

  async setAvatar(userId: string, file: { buffer: Buffer; size: number } | undefined) {
    if (!file?.buffer?.length)
      throw Errors.badRequest('FILE_REQUIRED', 'Attach an image in the "file" field');
    const type = sniffImage(file.buffer);
    if (!type) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Avatars must be PNG, JPEG, WebP or GIF images',
      );
    }
    const key = `avatars/${userId}-${randomToken(12)}.${type.ext}`;
    await this.storage.put(key, file.buffer, type.mime);
    const previous = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarKey: true },
    });
    await this.prisma.userProfile.update({ where: { userId }, data: { avatarKey: key } });
    if (previous?.avatarKey && previous.avatarKey !== key)
      await this.deleteObject(previous.avatarKey);
    return { avatarUrl: avatarUrl(key) };
  }

  async removeAvatar(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarKey: true },
    });
    if (!profile?.avatarKey) return;
    await this.prisma.userProfile.update({ where: { userId }, data: { avatarKey: null } });
    await this.deleteObject(profile.avatarKey);
  }

  private async deleteObject(key: string) {
    await this.storage.delete(key).catch((error: unknown) => {
      this.logger.warn(`Could not delete old avatar object: ${(error as Error).message}`);
    });
  }

  /** Avatar key if it currently belongs to a profile (orphans are not served). */
  async avatarKeyInUse(key: string): Promise<boolean> {
    return !!(await this.prisma.userProfile.findFirst({
      where: { avatarKey: key },
      select: { userId: true },
    }));
  }

  // ───────── Public profiles ─────────

  async profile(username: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: { profile: true },
    });
    if (!user || user.isGuest || user.suspendedAt) throw Errors.notFound('Profile');
    const isSelf = viewerId === user.id;
    const friendship: FriendshipStatus = isSelf
      ? 'self'
      : await this.friendships.friendshipStatus(viewerId, user.id);
    const p = user.profile;
    const identity = { ...publicUser(user), friendship };
    if (!canView(p?.profileVisibility ?? 'PUBLIC', isSelf, friendship)) {
      throw new AppError(403, 'PROFILE_PRIVATE', 'This profile is private', { profile: identity });
    }

    const [favoriteCount, playlistCount, favRows] = await Promise.all([
      this.prisma.favorite.count({ where: { userId: user.id } }),
      this.prisma.playlist.count({
        where: { ownerId: user.id, ...(isSelf ? {} : { visibility: 'PUBLIC' }) },
      }),
      this.prisma.favorite.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: RELATED_LIMIT,
        select: { movieId: true },
      }),
    ]);
    const result: Record<string, unknown> = {
      profile: {
        ...identity,
        bio: p?.bio ?? null,
        createdAt: user.createdAt,
        stats: { favorites: favoriteCount, playlists: playlistCount },
      },
      favorites: await this.catalog.getSummaries(
        favRows.map((f) => f.movieId),
        viewerId,
      ),
    };
    if (canView(p?.watchHistoryVisibility ?? 'PRIVATE', isSelf, friendship)) {
      const rows = await this.prisma.watchHistory.findMany({
        where: { userId: user.id },
        orderBy: { lastWatchedAt: 'desc' },
        take: RELATED_LIMIT,
      });
      const movies = new Map(
        (
          await this.catalog.getSummaries(
            rows.map((r) => r.movieId),
            viewerId,
          )
        ).map((m) => [m.id, m]),
      );
      result.history = rows
        .filter((r) => movies.has(r.movieId))
        .map((r) => ({
          movie: movies.get(r.movieId)!,
          positionSec: r.positionSec,
          durationSec: r.durationSec,
          completed: r.completed,
          lastWatchedAt: r.lastWatchedAt,
        }));
    }
    return result;
  }

  async search(rawQ: string, viewerId: string) {
    // Prisma passes LIKE wildcards through; match them literally.
    const q = rawQ.replace(/[\\%_]/g, '\\$&');
    const users = await this.prisma.user.findMany({
      where: {
        isGuest: false,
        suspendedAt: null,
        id: { not: viewerId },
        profile: { discoverable: true },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { profile: { displayName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { profile: true },
      orderBy: { username: 'asc' },
      take: 20,
    });
    const statuses = await this.friendships.statusMap(
      viewerId,
      users.map((u) => u.id),
    );
    return users.map((u) => ({ ...publicUser(u), friendship: statuses.get(u.id) ?? 'none' }));
  }
}
