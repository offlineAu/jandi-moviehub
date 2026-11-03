import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorageDriver } from './local.driver';

async function readAll(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString();
}

describe('LocalStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'jandi-storage-'));
    driver = new LocalStorageDriver(root);
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('puts, stats, streams ranges and deletes', async () => {
    await driver.put('a/b/file.txt', Buffer.from('0123456789'));
    expect((await driver.stat('a/b/file.txt'))?.size).toBe(10);
    expect(await readAll(await driver.createReadStream('a/b/file.txt', { start: 2, end: 5 }))).toBe(
      '2345',
    );
    await driver.delete('a/b/file.txt');
    expect(await driver.stat('a/b/file.txt')).toBeNull();
    expect(await driver.stat('a/b')).toBeNull();
  });

  it('refuses keys escaping the root', async () => {
    await expect(driver.put('../escape.txt', Buffer.from('x'))).rejects.toThrow();
    await expect(driver.stat('/etc/passwd')).rejects.toThrow();
  });
});
