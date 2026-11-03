import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
import { randomToken } from '../common/crypto';
import { resolveInside } from './storage-key';
import type { ByteRange, StorageDriverImpl, StorageStat } from './storage.types';

/** Files under a local directory. Delivery goes through the API's signed media route. */
export class LocalStorageDriver implements StorageDriverImpl {
  readonly name = 'LOCAL' as const;

  constructor(readonly root: string) {}

  pathFor(key: string): string {
    return resolveInside(this.root, key);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    // Write-then-rename so readers never observe a partially written file.
    const tmp = `${target}.${randomToken(6)}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, target);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async stat(key: string): Promise<StorageStat | null> {
    try {
      const s = await stat(this.pathFor(key));
      if (!s.isFile()) return null;
      return { size: s.size, modifiedAt: s.mtime };
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        (error as NodeJS.ErrnoException).code === 'ENOTDIR'
      ) {
        return null;
      }
      throw error;
    }
  }

  async createReadStream(key: string, range?: ByteRange): Promise<Readable> {
    return createReadStream(
      this.pathFor(key),
      range ? { start: range.start, end: range.end } : undefined,
    );
  }

  async signedUrl(): Promise<string | null> {
    return null;
  }
}
