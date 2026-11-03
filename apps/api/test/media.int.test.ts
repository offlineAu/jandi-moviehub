import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogService } from '../src/catalog/catalog.service';
import { MediaSigner } from '../src/catalog/media-signer';
import {
  FAKE_PLAYLIST,
  FAKE_SEGMENT,
  FAKE_VIDEO,
  FAKE_VTT,
  ids,
  seedTestCatalog,
} from './catalog-fixtures';
import { createTestApp, resetState, type TestApp } from './helpers';

/** supertest helper that collects the raw body regardless of content type. */
const raw = (req: request.Test) =>
  req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('signed media delivery (integration)', () => {
  let t: TestApp;
  let signer: MediaSigner;
  const http = () => request(t.app.getHttpServer());
  beforeAll(async () => {
    t = await createTestApp();
    signer = t.app.get(MediaSigner);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
    await seedTestCatalog(t);
  });

  const webmUrl = async () =>
    (await t.app.get(CatalogService).getPlaybackSources(ids.neonDrift))[0]!.url;

  it('streams the full file with type, length, ranges advertised and private caching', async () => {
    const res = await raw(http().get(await webmUrl())).expect(200);
    expect(res.headers['content-type']).toBe('video/webm');
    expect(res.headers['content-length']).toBe(String(FAKE_VIDEO.length));
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['cache-control']).toMatch(/^private, max-age=\d+$/);
    expect(Buffer.compare(res.body as Buffer, FAKE_VIDEO)).toBe(0);
  });

  it('supports HTTP Range requests (206) including suffix ranges, and 416 when unsatisfiable', async () => {
    const url = await webmUrl();
    const part = await raw(http().get(url).set('Range', 'bytes=100-199')).expect(206);
    expect(part.headers['content-range']).toBe(`bytes 100-199/${FAKE_VIDEO.length}`);
    expect(part.headers['content-length']).toBe('100');
    expect(Buffer.compare(part.body as Buffer, FAKE_VIDEO.subarray(100, 200))).toBe(0);

    const open = await raw(
      http()
        .get(url)
        .set('Range', `bytes=${FAKE_VIDEO.length - 10}-`),
    ).expect(206);
    expect((open.body as Buffer).length).toBe(10);
    const suffix = await raw(http().get(url).set('Range', 'bytes=-5')).expect(206);
    expect(Buffer.compare(suffix.body as Buffer, FAKE_VIDEO.subarray(-5))).toBe(0);

    const bad = await http().get(url).set('Range', `bytes=${FAKE_VIDEO.length}-`).expect(416);
    expect(bad.headers['content-range']).toBe(`bytes */${FAKE_VIDEO.length}`);
  });

  it('rejects tampered, foreign and expired signatures with 403', async () => {
    const url = await webmUrl();
    const parts = url.split('/'); // ['', 'api', 'v1', 'media', assetId, exp, sig, file]
    const tampered = [...parts];
    tampered[6] = `${tampered[6]!.slice(0, -2)}AA`;
    const r1 = await http().get(tampered.join('/')).expect(403);
    expect(r1.body.error.code).toBe('MEDIA_SIGNATURE_INVALID');

    const longer = [...parts];
    longer[5] = String(Number(longer[5]) + 3600); // extend expiry without re-signing
    await http().get(longer.join('/')).expect(403);

    const otherAsset = [...parts];
    otherAsset[4] = ids.projectionistHls;
    await http().get(otherAsset.join('/')).expect(403);

    const exp = Math.floor(Date.now() / 1000) - 5;
    const expired = await http()
      .get(signer.url(ids.neonWebm, 'video.webm', exp))
      .expect(403);
    expect(expired.body.error.code).toBe('MEDIA_URL_EXPIRED');

    await http().get(`/api/v1/media/not-a-uuid/123/abc/video.webm`).expect(403);
  });

  it('rejects path traversal with 400 even with a valid signature', async () => {
    const exp = signer.expiry();
    const base = `/api/v1/media/${ids.projectionistHls}/${exp}/${signer.sign(ids.projectionistHls, exp)}`;
    for (const path of [
      '..%2F..%2F..%2Fetc%2Fpasswd',
      '%2e%2e/%2e%2e/secret',
      'a/..%2F..%2Fx.ts',
      '.%2Findex.m3u8',
      'x%5C..%5Cy',
    ]) {
      const res = await http().get(`${base}/${path}`);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PATH');
    }
    // A progressive asset only serves its own file.
    const webm = new URL(`http://x${await webmUrl()}`).pathname.replace(
      /video\.webm$/,
      'other.webm',
    );
    await http().get(webm).expect(404);
  });

  it('serves HLS playlists and relative segments under the same signed prefix, plus captions', async () => {
    const src = (await t.app.get(CatalogService).getPlaybackSources(ids.projectionist)).find(
      (s) => s.format === 'HLS',
    )!;
    const playlist = await http().get(src.url).expect(200);
    expect(playlist.headers['content-type']).toBe('application/vnd.apple.mpegurl');
    expect(playlist.text).toBe(FAKE_PLAYLIST);
    const segmentUrl = src.url.replace(/index\.m3u8$/, 'segment_000.ts');
    const seg = await raw(http().get(segmentUrl)).expect(200);
    expect(seg.headers['content-type']).toBe('video/mp2t');
    expect((seg.body as Buffer).length).toBe(FAKE_SEGMENT.length);
    await http()
      .get(src.url.replace(/index\.m3u8$/, 'segment_999.ts'))
      .expect(404);

    const vtt = await http().get(src.captions[0]!.url).expect(200);
    expect(vtt.headers['content-type']).toMatch(/^text\/vtt/);
    expect(vtt.text).toBe(FAKE_VTT);
    await http().get(src.captions[0]!.url.replace('/en.vtt', '/fr.vtt')).expect(404);
  });

  it('refuses assets that are not approved or whose license is not valid', async () => {
    const url = await webmUrl();
    await t.prisma.mediaAsset.update({ where: { id: ids.neonWebm }, data: { status: 'PENDING' } });
    expect((await http().get(url).expect(403)).body.error.code).toBe('MEDIA_NOT_AVAILABLE');
    await t.prisma.mediaAsset.update({ where: { id: ids.neonWebm }, data: { status: 'APPROVED' } });
    const asset = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: ids.neonWebm } });
    await t.prisma.contentLicense.update({
      where: { id: asset.licenseId },
      data: { validFrom: new Date(Date.now() + 86_400_000) },
    });
    await http().get(url).expect(403);
  });

  it('returns 404 when the file behind an approved asset is missing', async () => {
    await t.prisma.mediaAsset.update({
      where: { id: ids.neonWebm },
      data: { storageKey: 'demo/missing/video.webm' },
    });
    const exp = signer.expiry();
    await http()
      .get(signer.url(ids.neonWebm, 'video.webm', exp))
      .expect(404);
  });
});
