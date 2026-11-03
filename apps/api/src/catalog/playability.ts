import type { Prisma } from '@prisma/client';

/**
 * A media asset may be streamed only when it is APPROVED and its license is verified
 * and inside its validity window. This is the single definition used everywhere.
 */
export function playableAssetWhere(now = new Date()): Prisma.MediaAssetWhereInput {
  return {
    status: 'APPROVED',
    license: {
      verifiedAt: { not: null },
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      ],
    },
  };
}

/** Movies that have at least one playable asset. */
export function playableMovieWhere(now = new Date()): Prisma.MovieWhereInput {
  return { mediaAssets: { some: playableAssetWhere(now) } };
}

interface LicenseLike {
  verifiedAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

/** In-memory equivalent of `playableAssetWhere` for already-loaded rows. */
export function isAssetPlayable(
  asset: { status: string; license: LicenseLike },
  now = new Date(),
): boolean {
  const l = asset.license;
  return (
    asset.status === 'APPROVED' &&
    l.verifiedAt !== null &&
    (l.validFrom === null || l.validFrom <= now) &&
    (l.validUntil === null || l.validUntil > now)
  );
}

/** Preferred delivery order: WebM (open codecs) → MP4 → HLS. */
export const FORMAT_ORDER: Record<string, number> = { WEBM: 0, MP4: 1, HLS: 2 };
