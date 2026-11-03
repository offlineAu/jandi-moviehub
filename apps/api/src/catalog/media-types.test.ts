import { describe, expect, it } from 'vitest';
import { contentTypeFor, parseRange } from './media-types';

describe('contentTypeFor', () => {
  it('maps media extensions', () => {
    expect(contentTypeFor('video.webm')).toBe('video/webm');
    expect(contentTypeFor('hls/index.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(contentTypeFor('segment_001.ts')).toBe('video/mp2t');
    expect(contentTypeFor('captions.en.vtt')).toMatch(/^text\/vtt/);
    expect(contentTypeFor('x.bin')).toBe('application/octet-stream');
  });
});

describe('parseRange', () => {
  it('handles open, closed and suffix ranges', () => {
    expect(parseRange(undefined, 100)).toEqual({ kind: 'none' });
    expect(parseRange('bytes=0-9', 100)).toEqual({ kind: 'range', start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ kind: 'range', start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ kind: 'range', start: 90, end: 99 });
    expect(parseRange('bytes=50-500', 100)).toEqual({ kind: 'range', start: 50, end: 99 });
  });

  it('flags unsatisfiable and ignores malformed / multi ranges', () => {
    expect(parseRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=0-1,5-6', 100)).toEqual({ kind: 'none' });
    expect(parseRange('items=0-1', 100)).toEqual({ kind: 'none' });
    expect(parseRange('bytes=9-3', 100)).toEqual({ kind: 'none' });
  });
});
