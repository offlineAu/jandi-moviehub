import { describe, expect, it } from 'vitest';
import { sniffVideo } from './video-sniff';

describe('sniffVideo', () => {
  it('detects WebM by the EBML header', () => {
    expect(sniffVideo(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]))?.format).toBe('WEBM');
  });

  it('detects MP4 by ftyp at byte 4', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1')]);
    expect(sniffVideo(mp4)).toEqual({ format: 'MP4', ext: 'mp4', mimeType: 'video/mp4' });
  });

  it('rejects other content and truncated headers', () => {
    expect(sniffVideo(Buffer.from('%PDF-1.7 hello'))).toBeNull();
    expect(sniffVideo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(sniffVideo(Buffer.from([0x1a, 0x45]))).toBeNull();
    expect(sniffVideo(Buffer.from('ftyp'))).toBeNull();
    expect(sniffVideo(Buffer.alloc(0))).toBeNull();
  });
});
