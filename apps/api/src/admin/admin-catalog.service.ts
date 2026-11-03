import { HttpStatus, Injectable } from '@nestjs/common';
import type { adminMediaAssetSchema, MediaAssetStatus } from '@jandi/shared';
import { Prisma, type ContentLicense, type MediaAsset } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';
import { isAssetPlayable, playableMovieWhere } from '../catalog/playability';
import { slugify } from '../catalog/providers/tmdb.mapper';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-context';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { isSafeKey } from '../storage/storage-key';
import { StorageService } from '../storage/storage.service';
import { publicUser } from '../users/user-view';
import type {
  AdminLicenseInput,
  AdminLicensePatch,
  AdminLicenseQuery,
  AdminMediaQuery,
  AdminMovieInput,
  AdminMoviePatch,
  AdminMovieQuery,
} from './admin.schemas';
import { sniffVideo } from './video-sniff';

export type AdminMediaAssetInput = z.infer<typeof adminMediaAssetSchema>;

const withProfile = { include: { profile: true } } as const;
const page = <T>(items: T[], p: number, size: number, total: number) => ({
  items,
  page: p,
  pageSize: size,
  total,
  totalPages: Math.max(1, Math.ceil(total / size)),
});

const DEFAULT_MIME: Record<string, string> = {
  WEBM: 'video/webm',
  MP4: 'video/mp4',
  HLS: 'application/vnd.apple.mpegurl',
};

/** True when the license is verified and `now` is inside its validity window. */
export function licenseUsable(
  l: Pick<ContentLicense, 'verifiedAt' | 'validFrom' | 'validUntil'>,
  now = new Date(),
) {
  return isAssetPlayable({ status: 'APPROVED', license: l }, now);
}

const movieInclude = {
  genres: { include: { genre: true } },
  _count: { select: { mediaAssets: true } },
} satisfies Prisma.MovieInclude;
type MovieRow = Prisma.MovieGetPayload<{ include: typeof movieInclude }>;

const licenseInclude = {
  verifiedBy: withProfile,
  _count: { select: { assets: true } },
} satisfies Prisma.ContentLicenseInclude;
type LicenseRow = Prisma.ContentLicenseGetPayload<{ include: typeof licenseInclude }>;

const mediaInclude = {
  movie: { select: { id: true, title: true } },
  license: true,
  approvedBy: withProfile,
} satisfies Prisma.MediaAssetInclude;
type MediaRow = Prisma.MediaAssetGetPayload<{ include: typeof mediaInclude }>;

/** Fields whose change invalidates a prior license verification. */
const MATERIAL_LICENSE_FIELDS = [
  'type',
  'licensor',
  'territory',
  'provenanceUrl',
  'validFrom',
  'validUntil',
] as const;

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ───────── Views ─────────

  movieView(m: MovieRow, playable: boolean) {
    return {
      id: m.id,
      title: m.title,
      source: m.source,
      tmdbId: m.tmdbId,
      isDemo: m.isDemo,
      overview: m.overview,
      releaseDate: m.releaseDate ? m.releaseDate.toISOString().slice(0, 10) : null,
      runtimeMin: m.runtimeMin,
      posterUrl: m.posterUrl,
      backdropUrl: m.backdropUrl,
      genres: m.genres.map((g) => g.genre.name).sort((a, b) => a.localeCompare(b)),
      assetCount: m._count.mediaAssets,
      playable,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  licenseView(l: LicenseRow) {
    return {
      id: l.id,
      type: l.type,
      title: l.title,
      licensor: l.licensor,
      territory: l.territory,
      provenanceUrl: l.provenanceUrl,
      attribution: l.attribution,
      validFrom: l.validFrom,
      validUntil: l.validUntil,
      notes: l.notes,
      verified: !!l.verifiedAt,
      verifiedAt: l.verifiedAt,
      verifiedBy: l.verifiedBy ? publicUser(l.verifiedBy) : null,
      usable: licenseUsable(l),
      assetCount: l._count.assets,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }

  mediaView(a: MediaRow) {
    return {
      id: a.id,
      movie: a.movie,
      license: {
        id: a.license.id,
        title: a.license.title,
        type: a.license.type,
        verified: !!a.license.verifiedAt,
        usable: licenseUsable(a.license),
      },
      label: a.label,
      format: a.format,
      storageDriver: a.storageDriver,
      storageKey: a.storageKey,
      mimeType: a.mimeType,
      durationSec: a.durationSec,
      sizeBytes: a.sizeBytes === null ? null : Number(a.sizeBytes),
      status: a.status,
      approvedAt: a.approvedAt,
      approvedBy: a.approvedBy ? publicUser(a.approvedBy) : null,
      playable: isAssetPlayable(a),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  private async playableSet(ids: string[]) {
    if (!ids.length) return new Set<string>();
    const rows = await this.prisma.movie.findMany({
      where: { id: { in: ids }, ...playableMovieWhere() },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  private async loadMovie(id: string) {
    const m = await this.prisma.movie.findUnique({ where: { id }, include: movieInclude });
    if (!m) throw Errors.notFound('Movie');
    return this.movieView(m, (await this.playableSet([id])).has(id));
  }

  // ───────── Movies ─────────

  async listMovies(q: AdminMovieQuery) {
    const where: Prisma.MovieWhereInput = {
      ...(q.source ? { source: q.source } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.movie.findMany({
        where,
        include: movieInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.movie.count({ where }),
    ]);
    const playable = await this.playableSet(rows.map((r) => r.id));
    return page(
      rows.map((r) => this.movieView(r, playable.has(r.id))),
      q.page,
      q.pageSize,
      total,
    );
  }

  /** Genre ids for the given names; unknown names are created (case-insensitive match). */
  private async upsertGenres(names: string[]): Promise<string[]> {
    const firstSpelling = new Map<string, string>();
    for (const n of names.map((x) => x.trim()).filter(Boolean)) {
      if (!firstSpelling.has(n.toLowerCase())) firstSpelling.set(n.toLowerCase(), n);
    }
    const unique = [...firstSpelling.values()];
    const ids: string[] = [];
    for (const name of unique) {
      const existing = await this.prisma.genre.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      let slug = slugify(name) || `genre-${randomUUID().slice(0, 8)}`;
      if (await this.prisma.genre.findUnique({ where: { slug } }))
        slug = `${slug}-${randomUUID().slice(0, 6)}`;
      try {
        ids.push((await this.prisma.genre.create({ data: { name, slug } })).id);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        const raced = await this.prisma.genre.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (!raced) throw e;
        ids.push(raced.id);
      }
    }
    return ids;
  }

  async createMovie(actor: AuthUser, input: AdminMovieInput, ip?: string) {
    const genreIds = await this.upsertGenres(input.genres);
    const movie = await this.prisma.$transaction(async (tx) => {
      const created = await tx.movie.create({
        data: {
          source: 'LOCAL',
          title: input.title,
          overview: input.overview || null,
          releaseDate: input.releaseDate ? new Date(`${input.releaseDate}T00:00:00Z`) : null,
          runtimeMin: input.runtimeMin ?? null,
          posterUrl: input.posterUrl ?? null,
          backdropUrl: input.backdropUrl ?? null,
          isDemo: input.isDemo,
          genres: { create: genreIds.map((genreId) => ({ genreId })) },
        },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.movie.create',
          targetType: 'movie',
          targetId: created.id,
          metadata: { title: input.title },
          ip,
        },
        tx,
      );
      return created;
    });
    return this.loadMovie(movie.id);
  }

  async updateMovie(actor: AuthUser, id: string, input: AdminMoviePatch, ip?: string) {
    const existing = await this.prisma.movie.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('Movie');
    if (existing.source !== 'LOCAL') {
      throw Errors.conflict(
        'TMDB_MANAGED',
        'TMDB titles are synced from TMDB and cannot be edited here',
      );
    }
    const genreIds = input.genres ? await this.upsertGenres(input.genres) : null;
    const data: Prisma.MovieUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.overview !== undefined) data.overview = input.overview || null;
    if (input.releaseDate !== undefined)
      data.releaseDate = input.releaseDate ? new Date(`${input.releaseDate}T00:00:00Z`) : null;
    if (input.runtimeMin !== undefined) data.runtimeMin = input.runtimeMin;
    if (input.posterUrl !== undefined) data.posterUrl = input.posterUrl;
    if (input.backdropUrl !== undefined) data.backdropUrl = input.backdropUrl;
    if (input.isDemo !== undefined) data.isDemo = input.isDemo;
    const changed = Object.keys(data);
    if (genreIds) changed.push('genres');
    await this.prisma.$transaction(async (tx) => {
      if (genreIds) {
        await tx.movieGenre.deleteMany({ where: { movieId: id } });
        if (genreIds.length)
          await tx.movieGenre.createMany({
            data: genreIds.map((genreId) => ({ movieId: id, genreId })),
          });
      }
      await tx.movie.update({ where: { id }, data });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.movie.update',
          targetType: 'movie',
          targetId: id,
          metadata: { fields: changed },
          ip,
        },
        tx,
      );
    });
    return this.loadMovie(id);
  }

  async deleteMovie(actor: AuthUser, id: string, ip?: string) {
    const existing = await this.prisma.movie.findUnique({
      where: { id },
      select: { id: true, title: true, source: true },
    });
    if (!existing) throw Errors.notFound('Movie');
    await this.prisma.$transaction(async (tx) => {
      await tx.movie.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.movie.delete',
          targetType: 'movie',
          targetId: id,
          metadata: { title: existing.title, source: existing.source },
          ip,
        },
        tx,
      );
    });
  }

  // ───────── Licenses ─────────

  async listLicenses(q: AdminLicenseQuery) {
    const where: Prisma.ContentLicenseWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.verified === undefined ? {} : { verifiedAt: q.verified ? { not: null } : null }),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { licensor: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.contentLicense.findMany({
        where,
        include: licenseInclude,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.contentLicense.count({ where }),
    ]);
    return page(
      rows.map((r) => this.licenseView(r)),
      q.page,
      q.pageSize,
      total,
    );
  }

  private async loadLicense(id: string) {
    const l = await this.prisma.contentLicense.findUnique({
      where: { id },
      include: licenseInclude,
    });
    if (!l) throw Errors.notFound('License');
    return l;
  }

  private static assertWindow(from: Date | null, until: Date | null) {
    if (from && until && until <= from) {
      throw Errors.badRequest('VALIDATION_FAILED', 'validUntil must be after validFrom', [
        { path: 'validUntil', message: 'Must be after validFrom' },
      ]);
    }
  }

  async createLicense(actor: AuthUser, input: AdminLicenseInput, ip?: string) {
    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    AdminCatalogService.assertWindow(validFrom, validUntil);
    const created = await this.prisma.$transaction(async (tx) => {
      const l = await tx.contentLicense.create({
        data: {
          type: input.type,
          title: input.title,
          licensor: input.licensor,
          territory: input.territory,
          provenanceUrl: input.provenanceUrl ?? null,
          attribution: input.attribution || null,
          validFrom,
          validUntil,
          notes: input.notes || null,
        },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.license.create',
          targetType: 'license',
          targetId: l.id,
          metadata: { type: input.type, title: input.title, licensor: input.licensor },
          ip,
        },
        tx,
      );
      return l;
    });
    return this.licenseView(await this.loadLicense(created.id));
  }

  /**
   * Partial update. Changing a material term (type, licensor, territory, provenance, window)
   * of a verified license clears its verification: the new terms must be re-verified.
   */
  async updateLicense(actor: AuthUser, id: string, input: AdminLicensePatch, ip?: string) {
    const existing = await this.loadLicense(id);
    const data: Prisma.ContentLicenseUpdateInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.title !== undefined) data.title = input.title;
    if (input.licensor !== undefined) data.licensor = input.licensor;
    if (input.territory !== undefined) data.territory = input.territory;
    if (input.provenanceUrl !== undefined) data.provenanceUrl = input.provenanceUrl;
    if (input.attribution !== undefined) data.attribution = input.attribution || null;
    if (input.validFrom !== undefined)
      data.validFrom = input.validFrom ? new Date(input.validFrom) : null;
    if (input.validUntil !== undefined)
      data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (input.notes !== undefined) data.notes = input.notes || null;
    AdminCatalogService.assertWindow(
      data.validFrom !== undefined ? (data.validFrom as Date | null) : existing.validFrom,
      data.validUntil !== undefined ? (data.validUntil as Date | null) : existing.validUntil,
    );
    const same = (a: unknown, b: unknown) =>
      a instanceof Date || b instanceof Date
        ? (a as Date | null)?.getTime() === (b as Date | null)?.getTime()
        : a === b;
    const changed = (Object.keys(data) as Array<keyof typeof data>).filter(
      (k) => !same(data[k], existing[k as keyof ContentLicense]),
    );
    const materialChange = changed.some((k) =>
      (MATERIAL_LICENSE_FIELDS as readonly string[]).includes(k),
    );
    const unverify = materialChange && !!existing.verifiedAt;
    if (unverify) {
      data.verifiedAt = null;
      data.verifiedBy = { disconnect: true };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contentLicense.update({ where: { id }, data });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.license.update',
          targetType: 'license',
          targetId: id,
          metadata: { fields: changed, verificationCleared: unverify },
          ip,
        },
        tx,
      );
    });
    return this.licenseView(await this.loadLicense(id));
  }

  async setLicenseVerified(actor: AuthUser, id: string, verified: boolean, ip?: string) {
    const existing = await this.loadLicense(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.contentLicense.update({
        where: { id },
        data: verified
          ? { verifiedAt: new Date(), verifiedBy: { connect: { id: actor.id } } }
          : { verifiedAt: null, verifiedBy: { disconnect: true } },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: verified ? 'admin.license.verify' : 'admin.license.unverify',
          targetType: 'license',
          targetId: id,
          metadata: { wasVerified: !!existing.verifiedAt },
          ip,
        },
        tx,
      );
    });
    return this.licenseView(await this.loadLicense(id));
  }

  // ───────── Media assets ─────────

  async listMedia(q: AdminMediaQuery) {
    const where: Prisma.MediaAssetWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.movieId ? { movieId: q.movieId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return page(
      rows.map((r) => this.mediaView(r)),
      q.page,
      q.pageSize,
      total,
    );
  }

  private async loadMedia(id: string) {
    const a = await this.prisma.mediaAsset.findUnique({ where: { id }, include: mediaInclude });
    if (!a) throw Errors.notFound('Media asset');
    return a;
  }

  /** Registers an asset whose file already exists in storage (HLS: a directory containing index.m3u8). */
  async registerMedia(actor: AuthUser, input: AdminMediaAssetInput, ip?: string) {
    const key = input.storageKey.replace(/\/+$/, '');
    if (!isSafeKey(key)) throw Errors.badRequest('INVALID_STORAGE_KEY', 'Invalid storage key');
    const [movie, license] = await Promise.all([
      this.prisma.movie.findUnique({ where: { id: input.movieId }, select: { id: true } }),
      this.prisma.contentLicense.findUnique({
        where: { id: input.licenseId },
        select: { id: true },
      }),
    ]);
    if (!movie) throw Errors.notFound('Movie');
    if (!license) throw Errors.notFound('License');
    const driver = this.storage.defaultDriver;
    const probeKey = input.format === 'HLS' ? `${key}/index.m3u8` : key;
    const stat = await this.storage.stat(probeKey, driver);
    if (!stat) {
      throw Errors.badRequest(
        'MEDIA_FILE_MISSING',
        input.format === 'HLS' ? `No index.m3u8 found under "${key}"` : `No file found at "${key}"`,
      );
    }
    const asset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          movieId: input.movieId,
          licenseId: input.licenseId,
          label: input.label,
          format: input.format,
          storageDriver: driver,
          storageKey: key,
          mimeType: input.mimeType || DEFAULT_MIME[input.format]!,
          durationSec: input.durationSec,
          sizeBytes: input.format === 'HLS' ? null : BigInt(stat.size),
          status: 'PENDING',
        },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.media.create',
          targetType: 'media_asset',
          targetId: created.id,
          metadata: {
            movieId: input.movieId,
            licenseId: input.licenseId,
            format: input.format,
            storageKey: key,
          },
          ip,
        },
        tx,
      );
      return created;
    });
    return this.mediaView(await this.loadMedia(asset.id));
  }

  /**
   * Stores an uploaded video (already written to a temp file by multer) under `uploads/<uuid>.<ext>`
   * after checking its magic bytes. The temp file is always removed.
   */
  async storeUpload(
    actor: AuthUser,
    file: { path: string; size: number } | undefined,
    ip?: string,
  ) {
    if (!file?.path) throw Errors.badRequest('FILE_REQUIRED', 'Attach a video in the "file" field');
    try {
      const head = Buffer.alloc(16);
      const handle = await open(file.path, 'r');
      let bytesRead = 0;
      try {
        ({ bytesRead } = await handle.read(head, 0, head.length, 0));
      } finally {
        await handle.close();
      }
      const kind = sniffVideo(head.subarray(0, bytesRead));
      if (!kind) {
        throw new AppError(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          'UNSUPPORTED_MEDIA_TYPE',
          'Only WebM and MP4 videos are accepted',
        );
      }
      const key = `uploads/${randomUUID()}.${kind.ext}`;
      const driver = this.storage.defaultDriver;
      if (driver === 'LOCAL') {
        const target = this.storage.local.pathFor(key);
        await mkdir(dirname(target), { recursive: true });
        try {
          await rename(file.path, target);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
          await copyFile(file.path, target);
        }
      } else {
        await this.storage.putFileToS3(key, file.path, file.size, kind.mimeType);
      }
      await this.audit.record({
        actorId: actor.id,
        action: 'admin.media.upload',
        targetType: 'storage_object',
        targetId: key,
        metadata: { format: kind.format, sizeBytes: file.size, storageDriver: driver },
        ip,
      });
      return {
        storageKey: key,
        format: kind.format,
        mimeType: kind.mimeType,
        sizeBytes: file.size,
        storageDriver: driver,
      };
    } finally {
      await rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  /** APPROVED requires the linked license to be verified and in its validity window. */
  async setMediaStatus(actor: AuthUser, id: string, status: MediaAssetStatus, ip?: string) {
    const existing: MediaAsset & { license: ContentLicense } = await this.loadMedia(id);
    if (status === 'APPROVED' && !licenseUsable(existing.license)) {
      throw Errors.conflict(
        'LICENSE_NOT_VERIFIED',
        'The linked license must be verified and within its validity window before the asset can be approved',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({
        where: { id },
        data:
          status === 'APPROVED'
            ? { status, approvedAt: new Date(), approvedBy: { connect: { id: actor.id } } }
            : { status, approvedAt: null, approvedBy: { disconnect: true } },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.media.status',
          targetType: 'media_asset',
          targetId: id,
          metadata: { from: existing.status, to: status, licenseId: existing.licenseId },
          ip,
        },
        tx,
      );
    });
    return this.mediaView(await this.loadMedia(id));
  }
}
