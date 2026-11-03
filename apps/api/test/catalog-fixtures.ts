import { AppConfig } from '../src/config/app-config';
import { StorageService } from '../src/storage/storage.service';
import { assetIdFor, movieIdFor, originalMediaKeys, seedCatalog } from '../prisma/seed';
import { ORIGINALS } from '../prisma/catalog-data';
import type { TestApp } from './helpers';

/** 64 KiB of deterministic bytes standing in for a WebM file (byte i = i % 251). */
export const FAKE_VIDEO = Buffer.from(Array.from({ length: 64 * 1024 }, (_, i) => i % 251));
export const FAKE_PLAYLIST =
  '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nsegment_000.ts\n#EXT-X-ENDLIST\n';
export const FAKE_SEGMENT = Buffer.alloc(1880, 0x47);
export const FAKE_VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n[Opening tone]\n';

/** Writes small stand-in media files to the test storage dir, then runs the real catalog seed. */
export async function seedTestCatalog(t: TestApp) {
  const storageDir = t.app.get(AppConfig).storageDir;
  // Never overwrite real demo media with stand-in bytes.
  if (!/test/i.test(storageDir))
    throw new Error(
      `Refusing to write test media into ${storageDir}; set STORAGE_LOCAL_DIR in .env.test`,
    );
  const storage = t.app.get(StorageService);
  for (const o of ORIGINALS) {
    const keys = originalMediaKeys(o.slug);
    await storage.put(keys.webm, FAKE_VIDEO, 'video/webm');
    await storage.put(keys.captions, Buffer.from(FAKE_VTT), 'text/vtt');
    if (o.hls) {
      await storage.put(
        keys.hlsPlaylist,
        Buffer.from(FAKE_PLAYLIST),
        'application/vnd.apple.mpegurl',
      );
      await storage.put(`${keys.hlsDir}/segment_000.ts`, FAKE_SEGMENT, 'video/mp2t');
    }
  }
  return seedCatalog(t.prisma, {
    storageDir: t.app.get(AppConfig).storageDir,
    log: () => undefined,
  });
}

export const ids = {
  neonDrift: movieIdFor('neon-drift'),
  projectionist: movieIdFor('the-last-projectionist'),
  sunrise: movieIdFor('twenty-second-sunrise'),
  courier: movieIdFor('paper-moon-courier'),
  nosferatu: movieIdFor('nosferatu-1922'),
  notld: movieIdFor('night-of-the-living-dead-1968'),
  caligari: movieIdFor('the-cabinet-of-dr-caligari-1920'),
  bunny: movieIdFor('big-buck-bunny-2008'),
  neonWebm: assetIdFor('neon-drift', 'WEBM'),
  projectionistHls: assetIdFor('the-last-projectionist', 'HLS'),
};
