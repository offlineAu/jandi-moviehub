import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { assertSafeKey } from './storage-key';
import type { ByteRange, SignedUrlOptions, StorageDriverImpl, StorageStat } from './storage.types';

export interface S3DriverOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** S3-compatible object storage (AWS S3, MinIO, R2 …). Delivery via presigned GET URLs. */
export class S3StorageDriver implements StorageDriverImpl {
  readonly name = 'S3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3DriverOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Upload a known-size file without holding its contents in the API process memory. */
  async putFile(
    key: string,
    filePath: string,
    sizeBytes: number,
    contentType: string,
  ): Promise<void> {
    const stream = createReadStream(filePath);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: assertSafeKey(key),
          Body: stream,
          ContentLength: sizeBytes,
          ContentType: contentType,
        }),
      );
    } finally {
      stream.destroy();
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }),
    );
  }

  async stat(key: string): Promise<StorageStat | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }),
      );
      return {
        size: Number(head.ContentLength ?? 0),
        modifiedAt: head.LastModified ?? new Date(0),
      };
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.$metadata.httpStatusCode === 404 || error.name === 'NotFound')
      ) {
        return null;
      }
      throw error;
    }
  }

  async createReadStream(key: string, range?: ByteRange): Promise<Readable> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key),
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    if (!out.Body) throw new Error('Empty S3 response body');
    return out.Body instanceof Readable
      ? out.Body
      : Readable.from(out.Body as AsyncIterable<Uint8Array>);
  }

  async signedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key),
        ResponseContentType: options.contentType,
      }),
      { expiresIn: options.expiresInSec },
    );
  }
}
