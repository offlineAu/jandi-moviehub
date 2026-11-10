import { describe, expect, it } from 'vitest';
import type { PlaybackSource } from '@/lib/types';
import {
  formatTime,
  formatTimeVerbose,
  nominalRate,
  orderCaptionChoices,
  selectSource,
  shortcutFor,
} from './utils';

describe('caption ordering', () => {
  it('puts English tracks first while preserving each track index and preferring the original', () => {
    const tracks = [
      { index: 0, lang: 'fil', label: 'Filipino (alternative · timing may differ)' },
      { index: 1, lang: 'eng', label: 'English (alternative · timing may differ)' },
      { index: 2, lang: 'en-US', label: 'English' },
      { index: 3, lang: 'deu', label: 'German' },
    ];
    expect(orderCaptionChoices(tracks).map((track) => track.index)).toEqual([2, 1, 3, 0]);
    expect(tracks.map((track) => track.index)).toEqual([0, 1, 2, 3]);
  });
});

const source = (
  format: PlaybackSource['format'],
  mimeType: string,
  url = `/media/${format}`,
): PlaybackSource => ({
  assetId: format,
  label: format,
  format,
  mimeType,
  durationSec: 120,
  url,
  captions: [],
  license: { type: 'DEMO_GENERATED', attribution: null },
});

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3600, '1:00:00'],
    [3723, '1:02:03'],
    [-3, '0:00'],
    [Number.NaN, '0:00'],
    [Number.POSITIVE_INFINITY, '0:00'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });

  it('produces a spoken form for screen readers', () => {
    expect(formatTimeVerbose(3723)).toBe('1 hour 2 minutes 3 seconds');
    expect(formatTimeVerbose(0)).toBe('0 seconds');
    expect(formatTimeVerbose(61)).toBe('1 minute 1 second');
  });
});

describe('selectSource', () => {
  const chromeLike = (mime: string) =>
    mime === 'video/webm' || mime === 'video/mp4' ? 'maybe' : '';

  it('picks the first natively playable progressive source', () => {
    const picked = selectSource([source('WEBM', 'video/webm'), source('MP4', 'video/mp4')], {
      canPlayType: chromeLike,
      hlsJsSupported: true,
    });
    expect(picked?.source.format).toBe('WEBM');
    expect(picked?.engine).toBe('native');
  });

  it('skips sources the browser cannot decode', () => {
    const picked = selectSource(
      [source('MP4', 'video/mp4; codecs="hvc1"'), source('WEBM', 'video/webm')],
      {
        canPlayType: (m) => (m === 'video/webm' ? 'probably' : ''),
        hlsJsSupported: false,
      },
    );
    expect(picked?.source.format).toBe('WEBM');
  });

  it('prefers native HLS on iOS when requested', () => {
    const picked = selectSource([source('HLS', 'application/vnd.apple.mpegurl')], {
      canPlayType: (m) => (m === 'application/vnd.apple.mpegurl' ? 'maybe' : ''),
      hlsJsSupported: true,
      preferNativeHls: true,
    });
    expect(picked?.engine).toBe('native');
  });

  it('prefers hls.js when a desktop browser reports partial native HLS support', () => {
    const picked = selectSource([source('HLS', 'application/vnd.apple.mpegurl')], {
      canPlayType: () => 'maybe',
      hlsJsSupported: true,
      preferNativeHls: false,
    });
    expect(picked?.engine).toBe('hls.js');
  });

  it('falls back to hls.js for HLS when MSE is available', () => {
    const picked = selectSource(
      [source('HLS', 'application/vnd.apple.mpegurl'), source('WEBM', 'video/webm')],
      {
        canPlayType: chromeLike,
        hlsJsSupported: true,
      },
    );
    expect(picked).toEqual({
      source: expect.objectContaining({ format: 'HLS' }),
      engine: 'hls.js',
    });
  });

  it('returns null when nothing can play', () => {
    expect(
      selectSource([source('HLS', 'application/vnd.apple.mpegurl')], {
        canPlayType: () => '',
        hlsJsSupported: false,
      }),
    ).toBeNull();
    expect(selectSource([], { canPlayType: chromeLike, hlsJsSupported: true })).toBeNull();
  });
});

describe('player helpers', () => {
  it('maps keyboard shortcuts', () => {
    expect(shortcutFor({ key: ' ', shiftKey: false })).toEqual({ kind: 'toggle-play' });
    expect(shortcutFor({ key: 'K', shiftKey: false })).toEqual({ kind: 'toggle-play' });
    expect(shortcutFor({ key: 'j', shiftKey: false })).toEqual({ kind: 'seek-by', seconds: -10 });
    expect(shortcutFor({ key: 'ArrowRight', shiftKey: false })).toEqual({
      kind: 'seek-by',
      seconds: 5,
    });
    expect(shortcutFor({ key: 'N', shiftKey: true })).toEqual({ kind: 'next' });
    expect(shortcutFor({ key: 'f', shiftKey: false, metaKey: true })).toBeNull();
    expect(shortcutFor({ key: 'x', shiftKey: false })).toBeNull();
  });

  it('snaps sync-nudged rates to the nearest menu option', () => {
    expect(nominalRate(1.04)).toBe(1);
    expect(nominalRate(0.93)).toBe(1);
    expect(nominalRate(1.5)).toBe(1.5);
  });
});
