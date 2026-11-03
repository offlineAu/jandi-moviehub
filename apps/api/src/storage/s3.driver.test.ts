import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { S3StorageDriver } from './s3.driver';

it('uploads a file through a size-bounded stream rather than a buffered body', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jandi-s3-test-'));
  try {
    const path = join(dir, 'video.webm');
    const bytes = Buffer.from('sample-video-content');
    await writeFile(path, bytes);
    const driver = new S3StorageDriver({
      region: 'us-east-1',
      bucket: 'test',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      forcePathStyle: true,
    });
    const send = vi.fn(
      async (command: { input: { Body: Readable; ContentLength: number; Key: string } }) => {
        expect(command.input.Body).toBeInstanceOf(Readable);
        expect(command.input.ContentLength).toBe(bytes.length);
        expect(command.input.Key).toBe('uploads/movie.webm');
        const chunks: Buffer[] = [];
        for await (const chunk of command.input.Body) chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks)).toEqual(bytes);
        return {};
      },
    );
    (driver as unknown as { client: { send: typeof send } }).client = { send };
    await driver.putFile('uploads/movie.webm', path, bytes.length, 'video/webm');
    expect(send).toHaveBeenCalledOnce();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
