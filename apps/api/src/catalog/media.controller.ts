import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Public } from '../common/auth-context';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { isSafeKey } from '../storage/storage-key';
import { StorageService } from '../storage/storage.service';
import { storedCaptions } from './catalog.service';
import { contentTypeFor, parseRange } from './media-types';
import { CAPTIONS_DIR, MediaSigner } from './media-signer';
import { isAssetPlayable } from './playability';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIG = /^[A-Za-z0-9_-]{20,100}$/;
const EXP = /^\d{1,12}$/;
/** Longest cache lifetime we hand out, regardless of the URL's remaining validity. */
const MAX_CACHE_SEC = 3600;

const forbidden = (code: string, message: string) =>
  new AppError(HttpStatus.FORBIDDEN, code, message);

/**
 * Signed media delivery: `GET /media/:assetId/:exp/:sig/*path`.
 * Local storage is streamed with HTTP Range support; S3 objects are redirected to presigned URLs
 * (HLS playlists are proxied so their relative segment URLs keep resolving through this route).
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly signer: MediaSigner,
  ) {}

  @Public()
  @Get(':assetId/:exp/:sig/*path')
  async serve(
    @Param('assetId') assetId: string,
    @Param('exp') expRaw: string,
    @Param('sig') sig: string,
    @Param('path') pathParam: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!UUID.test(assetId) || !EXP.test(expRaw) || !SIG.test(sig)) {
      throw forbidden('MEDIA_SIGNATURE_INVALID', 'This media link is invalid');
    }
    const exp = Number(expRaw);
    const verdict = this.signer.verify(assetId, exp, sig);
    if (verdict === 'invalid')
      throw forbidden('MEDIA_SIGNATURE_INVALID', 'This media link is invalid');
    if (verdict === 'expired') throw forbidden('MEDIA_URL_EXPIRED', 'This media link has expired');

    const segments = Array.isArray(pathParam) ? pathParam : String(pathParam ?? '').split('/');
    const relPath = segments.join('/');
    if (!relPath || !isSafeKey(relPath))
      throw Errors.badRequest('INVALID_PATH', 'Invalid media path');

    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { license: true },
    });
    if (!asset) throw Errors.notFound('Media');
    if (!isAssetPlayable(asset))
      throw forbidden('MEDIA_NOT_AVAILABLE', 'This media is not available for streaming');

    const key = this.resolveKey(asset, relPath);
    if (!key || !isSafeKey(key)) throw Errors.notFound('Media file');

    const driver = asset.storageDriver;
    const stat = await this.storage.stat(key, driver);
    if (!stat) throw Errors.notFound('Media file');

    const remaining = exp - Math.floor(Date.now() / 1000);
    const contentType = contentTypeFor(key);
    res.setHeader(
      'Cache-Control',
      `private, max-age=${Math.max(0, Math.min(remaining, MAX_CACHE_SEC))}`,
    );
    res.setHeader('Content-Type', contentType);

    if (driver === 'S3' && !key.endsWith('.m3u8')) {
      const url = await this.storage.signedUrl(
        key,
        { expiresInSec: Math.max(60, Math.min(remaining, MAX_CACHE_SEC)), contentType },
        driver,
      );
      res.removeHeader('Content-Type');
      res.redirect(302, url!);
      return;
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Last-Modified', stat.modifiedAt.toUTCString());
    const range =
      driver === 'LOCAL' ? parseRange(req.headers.range, stat.size) : { kind: 'none' as const };
    if (range.kind === 'unsatisfiable') {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }
    if (range.kind === 'range') {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      res.setHeader('Content-Length', String(range.end - range.start + 1));
    } else {
      res.status(200);
      res.setHeader('Content-Length', String(stat.size));
    }
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = await this.storage.createReadStream(
      key,
      range.kind === 'range' ? { start: range.start, end: range.end } : undefined,
      driver,
    );
    try {
      await pipeline(stream, res);
    } catch {
      // Client aborted (seeking players do this constantly) — nothing to report.
      if (!res.destroyed) res.destroy();
    }
  }

  /**
   * Maps a path inside the signed URL to a storage key:
   *  - `_captions/<lang>.vtt` → that caption track's key
   *  - HLS: `<storageKey>/<path>` (playlist + segments live in the asset's directory)
   *  - progressive: only the asset's own file name
   */
  private resolveKey(
    asset: { format: string; storageKey: string; captions: unknown },
    relPath: string,
  ): string | null {
    if (relPath.startsWith(`${CAPTIONS_DIR}/`)) {
      const lang = relPath.slice(CAPTIONS_DIR.length + 1).replace(/\.vtt$/, '');
      return storedCaptions(asset.captions).find((c) => c.lang === lang)?.storageKey ?? null;
    }
    if (asset.format === 'HLS') return `${asset.storageKey.replace(/\/+$/, '')}/${relPath}`;
    return relPath === basename(asset.storageKey) ? asset.storageKey : null;
  }
}
