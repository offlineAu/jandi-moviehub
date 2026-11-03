import type { PrismaService } from '../src/prisma/prisma.service';

let n = 0;

/** A movie with a verified license and an approved asset (no file needed for sync tests). */
export async function createPlayableMovie(
  prisma: PrismaService,
  opts: { durationSec?: number; title?: string } = {},
) {
  n += 1;
  const license = await prisma.contentLicense.create({
    data: {
      type: 'DEMO_GENERATED',
      title: 'Test license',
      licensor: 'Jandi tests',
      verifiedAt: new Date(),
    },
  });
  const movie = await prisma.movie.create({
    data: {
      title: opts.title ?? `Test Movie ${n}`,
      isDemo: true,
      runtimeMin: Math.ceil((opts.durationSec ?? 120) / 60),
      mediaAssets: {
        create: {
          licenseId: license.id,
          format: 'WEBM',
          storageKey: `demo/test-${n}/movie.webm`,
          mimeType: 'video/webm',
          durationSec: opts.durationSec ?? 120,
          status: 'APPROVED',
        },
      },
    },
  });
  return movie;
}

export async function createUnplayableMovie(prisma: PrismaService, title = 'Metadata Only') {
  return prisma.movie.create({ data: { title } });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 8000,
  intervalMs = 100,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (predicate(v)) return v;
    if (Date.now() - start > timeoutMs)
      throw new Error(`waitFor timed out; last value: ${JSON.stringify(v)}`);
    await sleep(intervalMs);
  }
}
