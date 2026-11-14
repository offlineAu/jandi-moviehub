import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
async function main() {
  const schema = z
    .array(
      z
        .object({
          catalogKey: z.string().min(1),
          key: z.string().min(1).max(100),
          label: z.string().min(1).max(300),
          ordinal: z.number().int().nonnegative(),
          kind: z.enum(['episode', 'special', 'movie', 'recap']).default('episode'),
          sources: z.array(
            z
              .object({
                adapterId: z.string().regex(/^[a-z0-9-]{1,40}$/),
                providerType: z.enum(['series', 'movie']),
                providerId: z.string().min(1).max(500),
                streamName: z.string().min(1).max(300),
                edition: z.string().min(1).max(200),
                audioLanguage: z.string().default('ja'),
                subtitleLanguage: z.string().optional(),
                evidence: z.string().min(20).max(4000),
                verified: z.boolean().default(false),
                enabled: z.boolean().default(false),
              })
              .strict(),
          ),
        })
        .strict(),
    )
    .max(10000);
  const file = process.argv[2];
  if (!file) throw new Error('Usage: tsx scripts/import-anime-mappings.ts reviewed-mappings.json');
  const mappings = schema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (mappings.some((m) => m.sources.some((s) => s.enabled && !s.verified)))
    throw new Error('Unverified sources cannot be enabled');
  const prisma = new PrismaClient();
  try {
    for (const item of mappings) {
      await prisma.$transaction(async (tx) => {
        const anime = await tx.animeTitle.findUniqueOrThrow({
          where: { catalogKey: item.catalogKey },
        });
        const episode = await tx.animeEpisode.upsert({
          where: { animeId_key: { animeId: anime.id, key: item.key } },
          create: {
            animeId: anime.id,
            key: item.key,
            label: item.label,
            ordinal: item.ordinal,
            kind: item.kind,
          },
          update: { label: item.label, ordinal: item.ordinal, kind: item.kind },
        });
        for (const source of item.sources) {
          const existing = await tx.animeSource.findUnique({
            where: {
              episodeId_adapterId_providerId: {
                episodeId: episode.id,
                adapterId: source.adapterId,
                providerId: source.providerId,
              },
            },
          });
          if (
            existing &&
            (existing.edition !== source.edition ||
              existing.streamName !== source.streamName ||
              existing.providerType !== source.providerType)
          )
            throw new Error(
              'Existing source edition is immutable. Disable it and register a new source identity.',
            );
          await tx.animeSource.upsert({
            where: {
              episodeId_adapterId_providerId: {
                episodeId: episode.id,
                adapterId: source.adapterId,
                providerId: source.providerId,
              },
            },
            create: { episodeId: episode.id, ...source },
            update: source,
          });
        }
      });
    }
    console.log(`Imported ${mappings.length} reviewed episode mappings.`);
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error('Anime import failed; check the input and database configuration.');
  process.exitCode = 1;
});
