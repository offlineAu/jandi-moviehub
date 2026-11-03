import { describe, expect, it } from 'vitest';
import { AVATAR_FILE, sniffImage } from './avatar';

describe('sniffImage', () => {
  it('detects supported formats by magic bytes', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe(
      'png',
    );
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(sniffImage(Buffer.from('GIF89a....'))?.ext).toBe('gif');
    expect(
      sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))
        ?.ext,
    ).toBe('webp');
  });

  it('rejects everything else', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it('validates stored avatar file names', () => {
    expect(AVATAR_FILE.test('0b8f6f1e-7a3c-4d7e-9a55-3f8e3f6e2a10-AbCdEf123456.png')).toBe(true);
    expect(AVATAR_FILE.test('../0b8f6f1e-7a3c-4d7e-9a55-3f8e3f6e2a10-x.png')).toBe(false);
    expect(AVATAR_FILE.test('0b8f6f1e-7a3c-4d7e-9a55-3f8e3f6e2a10-AbCdEf123456.svg')).toBe(false);
  });
});
