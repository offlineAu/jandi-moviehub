import type { Readable } from 'node:stream';

export type StorageDriverName = 'LOCAL' | 'S3';

export interface StorageStat {
  size: number;
  modifiedAt: Date;
}

/** Inclusive byte range. */
export interface ByteRange {
  start: number;
  end: number;
}

export interface SignedUrlOptions {
  expiresInSec: number;
  contentType?: string;
}

export interface StorageDriverImpl {
  readonly name: StorageDriverName;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  stat(key: string): Promise<StorageStat | null>;
  createReadStream(key: string, range?: ByteRange): Promise<Readable>;
  /** A URL a client can fetch directly, or null when the driver cannot presign (local). */
  signedUrl(key: string, options: SignedUrlOptions): Promise<string | null>;
}
