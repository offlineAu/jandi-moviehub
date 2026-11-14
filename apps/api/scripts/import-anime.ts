/** Run against an isolated database first. Input is a downloaded, versioned AOD release. */
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
async function main() {
  const [file, revision] = process.argv.slice(2);
  if (!file || !revision)
    throw new Error('Usage: tsx scripts/import-anime.ts release.json RELEASE_REVISION');
  const schema = z.object({
    data: z
      .array(
        z.object({
          title: z.string().min(1).max(500),
          sources: z.array(z.url()).min(1),
          synonyms: z.array(z.string()).default([]),
          type: z.string(),
          picture: z.string().optional(),
        }),
      )
      .max(100000),
  });
  const input = schema.parse(JSON.parse(await readFile(file, 'utf8')));
  const prisma = new PrismaClient();
  let imported = 0;
  try {
    for (const entry of input.data) {
      const ids: Record<string, string> = {};
      for (const source of entry.sources) {
        const url = new URL(source);
        const match = url.pathname.match(/\/(?:anime\/)?(\d+)\/?$/);
        if (match) ids[url.hostname] = match[1]!;
      }
      // Stable provider IDs, not names, are import keys. Never generate playable episodes from counts.
      const host = ['myanimelist.net', 'anilist.co', 'anidb.net', 'kitsu.app', 'kitsu.io'].find(
        (h) => ids[h],
      );
      if (!host) continue;
      const catalogKey = `${host}:${ids[host]}`;
      const data = {
        title: entry.title,
        aliases: [...new Set(entry.synonyms.map((a) => a.toLowerCase()))],
        format: entry.type,
        externalIds: ids,
        posterUrl: entry.picture?.startsWith('https://') ? entry.picture : null,
        provenance: `Anime Offline Database ${revision}; https://github.com/manami-project/anime-offline-database; ODbL-1.0`,
      };
      await prisma.animeTitle.upsert({
        where: { catalogKey },
        create: { catalogKey, ...data },
        update: data,
      });
      imported++;
    }
    console.log(`Imported ${imported} anime titles. No playback mappings were inferred.`);
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error('Anime import failed; check the input and database configuration.');
  process.exitCode = 1;
});
