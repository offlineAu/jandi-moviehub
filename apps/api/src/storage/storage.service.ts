import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { AppConfig } from '../config/app-config';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';
import type {
  ByteRange,
  SignedUrlOptions,
  StorageDriverImpl,
  StorageDriverName,
  StorageStat,
} from './storage.types';

/**
 * Object storage facade. New objects go to the configured driver (`STORAGE_DRIVER`);
 * existing objects are addressed with the driver they were stored with (e.g. `MediaAsset.storageDriver`).
 */
@Injectable()
export class StorageService {
  readonly local: LocalStorageDriver;
  private readonly s3: S3StorageDriver | null;

  constructor(config: AppConfig) {
    const env = config.env;
    this.local = new LocalStorageDriver(config.storageDir);
    this.s3 =
      env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? new S3StorageDriver({
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            bucket: env.S3_BUCKET,
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
          })
        : null;
    this.defaultDriver = env.STORAGE_DRIVER === 's3' ? 'S3' : 'LOCAL';
  }

  /** Driver used for new uploads. */
  readonly defaultDriver: StorageDriverName;

  driver(name: StorageDriverName = this.defaultDriver): StorageDriverImpl {
    if (name === 'LOCAL') return this.local;
    if (!this.s3) throw new Error('S3 storage is not configured');
    return this.s3;
  }

  put(key: string, body: Buffer, contentType: string, driver?: StorageDriverName) {
    return this.driver(driver).put(key, body, contentType);
  }

  putFileToS3(key: string, filePath: string, sizeBytes: number, contentType: string) {
    if (!this.s3) throw new Error('S3 storage is not configured');
    return this.s3.putFile(key, filePath, sizeBytes, contentType);
  }

  delete(key: string, driver?: StorageDriverName) {
    return this.driver(driver).delete(key);
  }

  stat(key: string, driver?: StorageDriverName): Promise<StorageStat | null> {
    return this.driver(driver).stat(key);
  }

  createReadStream(key: string, range?: ByteRange, driver?: StorageDriverName): Promise<Readable> {
    return this.driver(driver).createReadStream(key, range);
  }

  /** Presigned URL (S3) or null (local — serve through a signed API route instead). */
  signedUrl(
    key: string,
    options: SignedUrlOptions,
    driver?: StorageDriverName,
  ): Promise<string | null> {
    return this.driver(driver).signedUrl(key, options);
  }
}
