import { hmac, safeEqual } from '../common/crypto';

export const MEDIA_ROUTE_PREFIX = '/api/v1/media';
/** Pseudo-directory (inside the signed path) under which caption tracks are served. */
export const CAPTIONS_DIR = '_captions';

/**
 * HMAC-SHA256 signatures for media URLs. The signature lives in the PATH
 * (`/media/:assetId/:exp/:sig/<file>`) so relative URLs inside HLS playlists inherit it.
 */
export class MediaSigner {
  constructor(
    private readonly secret: string,
    private readonly ttlSec: number,
  ) {}

  sign(assetId: string, exp: number): string {
    return hmac(this.secret, `${assetId}:${exp}`);
  }

  expiry(nowMs = Date.now()): number {
    return Math.floor(nowMs / 1000) + this.ttlSec;
  }

  /** Relative, signed URL for `file` within the asset (e.g. `video.webm`, `index.m3u8`, `_captions/en.vtt`). */
  url(assetId: string, file: string, exp = this.expiry()): string {
    const encoded = file.split('/').map(encodeURIComponent).join('/');
    return `${MEDIA_ROUTE_PREFIX}/${assetId}/${exp}/${this.sign(assetId, exp)}/${encoded}`;
  }

  verify(
    assetId: string,
    exp: number,
    sig: string,
    nowMs = Date.now(),
  ): 'ok' | 'expired' | 'invalid' {
    if (!Number.isSafeInteger(exp) || exp <= 0) return 'invalid';
    if (!safeEqual(this.sign(assetId, exp), sig)) return 'invalid';
    if (exp * 1000 < nowMs) return 'expired';
    return 'ok';
  }
}
