/* eslint-disable no-console */
/**
 * Idempotent seed: genres, the local demo catalog (Jandi Originals + public-domain / CC
 * reference titles) and — only with SEED_DEMO_USERS=true — two clearly-labelled demo accounts.
 *
 *   pnpm media:generate   # create the original films first (storage/demo/…)
 *   pnpm db:seed
 */
import { passwordSchema } from '@jandi/shared';
import { type MediaFormat, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../src/auth/password';
import { artworkUrl } from '../src/catalog/artwork';
import {
  DEMO_LICENSE,
  GENRES,
  ORIGINALS,
  ORIGINALS_RELEASE_DATE,
  type OriginalTitle,
  REFERENCE_TITLES,
} from './catalog-data';

type Log = (message: string) => void;

/** Stable UUID (v5-shaped) derived from a name, so re-seeding updates the same rows. */
export function seedUuid(name: string): string {
  const h = createHash('sha1').update(`jandi-moviehub:${name}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const movieIdFor = (slug: string) => seedUuid(`movie:${slug}`);
export const assetIdFor = (slug: string, format: MediaFormat) =>
  seedUuid(`asset:${slug}:${format}`);

/** Storage keys of the generated media (see scripts/generate-demo-media.mjs). */
export function originalMediaKeys(slug: string) {
  return {
    webm: `demo/${slug}/video.webm`,
    captions: `demo/${slug}/captions.en.vtt`,
    hlsDir: `demo/${slug}/hls`,
    hlsPlaylist: `demo/${slug}/hls/index.m3u8`,
  };
}

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function seedGenres(prisma: PrismaClient) {
  for (const g of GENRES) {
    const existing =
      (await prisma.genre.findUnique({ where: { tmdbId: g.tmdbId } })) ??
      (await prisma.genre.findUnique({ where: { slug: g.slug } }));
    if (existing) {
      await prisma.genre.update({
        where: { id: existing.id },
        data: { tmdbId: g.tmdbId, name: g.name, slug: g.slug },
      });
    } else {
      await prisma.genre.create({ data: g });
    }
  }
  const rows = await prisma.genre.findMany();
  return new Map(rows.map((r) => [r.name, r.id]));
}

async function upsertLicense(
  prisma: PrismaClient,
  data: {
    type: 'PUBLIC_DOMAIN' | 'CREATIVE_COMMONS' | 'DEMO_GENERATED';
    title: string;
    licensor: string;
    territory: string;
    provenanceUrl?: string | null;
    attribution: string | null;
    notes: string;
    verified: boolean;
  },
) {
  const id = seedUuid(`license:${data.title}`);
  const { verified, ...fields } = data;
  const existing = await prisma.contentLicense.findUnique({ where: { id } });
  return prisma.contentLicense.upsert({
    where: { id },
    create: { id, ...fields, verifiedAt: verified ? new Date() : null },
    update: { ...fields, verifiedAt: verified ? (existing?.verifiedAt ?? new Date()) : null },
  });
}

async function upsertMovie(
  prisma: PrismaClient,
  genreIds: Map<string, string>,
  movie: {
    slug: string;
    title: string;
    originalTitle?: string | null;
    tagline?: string | null;
    overview: string;
    releaseDate: string;
    runtimeMin: number | null;
    genres: string[];
    popularity: number;
    isDemo: boolean;
    originalLanguage: string;
    attribution: string | null;
  },
) {
  const id = movieIdFor(movie.slug);
  const data = {
    source: 'LOCAL' as const,
    isDemo: movie.isDemo,
    title: movie.title,
    originalTitle: movie.originalTitle ?? movie.title,
    tagline: movie.tagline ?? null,
    overview: movie.overview,
    releaseDate: date(movie.releaseDate),
    runtimeMin: movie.runtimeMin,
    posterUrl: artworkUrl(movie.slug, 'poster'),
    backdropUrl: artworkUrl(movie.slug, 'backdrop'),
    voteAverage: null,
    voteCount: null,
    popularity: movie.popularity,
    originalLanguage: movie.originalLanguage,
    cast: [],
    trailers: [],
    attribution: movie.attribution,
  };
  const genreLinks = movie.genres.map((name) => {
    const genreId = genreIds.get(name);
    if (!genreId) throw new Error(`Unknown genre "${name}" for ${movie.slug}`);
    return { genreId };
  });
  await prisma.movie.upsert({
    where: { id },
    create: { id, ...data, genres: { create: genreLinks } },
    update: { ...data, genres: { deleteMany: {}, create: genreLinks } },
  });
  return id;
}

function fileInfo(storageDir: string, key: string) {
  const full = resolve(storageDir, key);
  if (!existsSync(full)) return null;
  const s = statSync(full);
  return s.isFile() ? { size: s.size } : null;
}

async function upsertOriginalAssets(
  prisma: PrismaClient,
  original: OriginalTitle,
  movieId: string,
  licenseId: string,
  storageDir: string,
  log: Log,
) {
  const keys = originalMediaKeys(original.slug);
  const captionsFile = fileInfo(storageDir, keys.captions);
  const captions = captionsFile
    ? [{ lang: 'en', label: 'English', storageKey: keys.captions }]
    : [];
  const renditions: Array<{
    format: MediaFormat;
    storageKey: string;
    probeKey: string;
    mimeType: string;
    label: string;
  }> = [
    {
      format: 'WEBM',
      storageKey: keys.webm,
      probeKey: keys.webm,
      mimeType: 'video/webm',
      label: 'WebM (VP9/Opus)',
    },
  ];
  if (original.hls) {
    renditions.push({
      format: 'HLS',
      storageKey: keys.hlsDir,
      probeKey: keys.hlsPlaylist,
      mimeType: 'application/vnd.apple.mpegurl',
      label: 'HLS (H.264/AAC)',
    });
  }
  let approved = 0;
  for (const r of renditions) {
    const id = assetIdFor(original.slug, r.format);
    const file = fileInfo(storageDir, r.probeKey);
    const status = file ? ('APPROVED' as const) : ('PENDING' as const);
    if (!file)
      log(
        `  ! ${r.probeKey} not found — asset left PENDING. Run \`pnpm media:generate\` then re-run the seed.`,
      );
    else approved += 1;
    const data = {
      movieId,
      licenseId,
      label: r.label,
      format: r.format,
      storageDriver: 'LOCAL' as const,
      storageKey: r.storageKey,
      mimeType: r.mimeType,
      durationSec: original.durationSec,
      width: 640,
      height: 360,
      sizeBytes: r.format === 'HLS' ? null : file ? BigInt(file.size) : null,
      captions,
      status,
      approvedAt: file ? new Date() : null,
    };
    await prisma.mediaAsset.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  return approved;
}

export interface SeedCatalogOptions {
  storageDir: string;
  log?: Log;
}

export async function seedCatalog(
  prisma: PrismaClient,
  { storageDir, log = console.log }: SeedCatalogOptions,
) {
  const genreIds = await seedGenres(prisma);
  log(`Genres: ${genreIds.size}`);

  const demoLicense = await upsertLicense(prisma, {
    ...DEMO_LICENSE,
    provenanceUrl: null,
    verified: true,
  });
  let playableAssets = 0;
  for (const o of ORIGINALS) {
    const movieId = await upsertMovie(prisma, genreIds, {
      slug: o.slug,
      title: o.title,
      tagline: o.tagline,
      overview: o.overview,
      releaseDate: ORIGINALS_RELEASE_DATE,
      runtimeMin: Math.max(1, Math.round(o.durationSec / 60)),
      genres: o.genres,
      popularity: o.popularity,
      isDemo: true,
      originalLanguage: 'en',
      attribution: DEMO_LICENSE.attribution,
    });
    playableAssets += await upsertOriginalAssets(
      prisma,
      o,
      movieId,
      demoLicense.id,
      storageDir,
      log,
    );
  }
  log(`Jandi Originals: ${ORIGINALS.length} (approved assets: ${playableAssets})`);

  for (const t of REFERENCE_TITLES) {
    await upsertMovie(prisma, genreIds, { ...t, isDemo: false });
    // Provenance record only — unverified and not attached to any asset, so the title is not playable.
    await upsertLicense(prisma, { ...t.license, verified: false });
  }
  log(
    `Public-domain / Creative Commons reference titles (metadata only): ${REFERENCE_TITLES.length}`,
  );
  return { originals: ORIGINALS.length, reference: REFERENCE_TITLES.length, playableAssets };
}

const DEMO_USERS = [
  { username: 'demo_alice', displayName: 'Alice (demo)', email: 'demo_alice@example.com' },
  { username: 'demo_bob', displayName: 'Bob (demo)', email: 'demo_bob@example.com' },
];

/** Two ordinary (never admin) demo accounts that are friends with each other. */
export async function seedDemoUsers(
  prisma: PrismaClient,
  password: string,
  log: Log = console.log,
) {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success)
    throw new Error(`SEED_DEMO_PASSWORD is invalid: ${parsed.error.issues[0]?.message}`);
  const passwordHash = await hashPassword(password);
  const ids: string[] = [];
  for (const u of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, role: 'USER' },
        })
      : await prisma.user.create({
          data: {
            username: u.username,
            email: u.email,
            passwordHash,
            role: 'USER',
            emailVerifiedAt: new Date(),
            profile: {
              create: {
                displayName: u.displayName,
                bio: 'Demo account seeded for local development.',
              },
            },
            watchlists: { create: { name: 'My Watchlist', isDefault: true } },
          },
        });
    ids.push(user.id);
  }
  const [a, b] = [...ids].sort() as [string, string];
  await prisma.friendship.upsert({
    where: { userAId_userBId: { userAId: a, userBId: b } },
    create: { userAId: a, userBId: b },
    update: {},
  });
  log(`Demo users: ${DEMO_USERS.map((u) => u.username).join(', ')} (friends)`);
}

async function main() {
  const envFile = resolve(process.cwd(), '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const storageDir = resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || '../../storage');
  const prisma = new PrismaClient();
  try {
    console.log(`Seeding (storage: ${storageDir})`);
    await seedCatalog(prisma, { storageDir });
    if (process.env.SEED_DEMO_USERS === 'true') {
      const password = process.env.SEED_DEMO_PASSWORD;
      if (!password)
        throw new Error(
          'SEED_DEMO_USERS=true requires SEED_DEMO_PASSWORD (no default password is used).',
        );
      await seedDemoUsers(prisma, password);
    } else {
      console.log(
        'Demo users skipped (set SEED_DEMO_USERS=true and SEED_DEMO_PASSWORD to create them).',
      );
    }
    console.log('Seed complete.');
  } finally {
    await prisma.$disconnect();
  }
}

if (/seed\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
