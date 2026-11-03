import { describe, expect, it } from 'vitest';
import { MediaSigner } from './media-signer';

const signer = new MediaSigner('x'.repeat(40), 3600);
const asset = '0b8f6f1e-7a3c-4d7e-9a55-3f8e3f6e2a10';

describe('MediaSigner', () => {
  it('builds verifiable path-signed URLs', () => {
    const exp = signer.expiry(1_000_000_000_000);
    const url = signer.url(asset, 'hls/index.m3u8', exp);
    const [, , , , id, e, sig, ...rest] = url.split('/');
    expect(id).toBe(asset);
    expect(rest.join('/')).toBe('hls/index.m3u8');
    expect(signer.verify(asset, Number(e), sig!, 1_000_000_000_000)).toBe('ok');
  });

  it('rejects tampering and expiry', () => {
    const exp = 2_000_000_000;
    const sig = signer.sign(asset, exp);
    expect(signer.verify(asset, exp + 1, sig, 0)).toBe('invalid');
    expect(signer.verify('another', exp, sig, 0)).toBe('invalid');
    expect(signer.verify(asset, exp, sig, (exp + 1) * 1000)).toBe('expired');
    expect(new MediaSigner('y'.repeat(40), 60).verify(asset, exp, sig, 0)).toBe('invalid');
  });
});
