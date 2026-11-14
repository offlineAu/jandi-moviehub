import { describe, expect, it } from 'vitest';
import { normalizeStreams, publicAddress, secureUrl, type AdapterConfig } from './source-adapter';
const config: AdapterConfig = {
  id: 'test',
  family: 'test',
  baseUrl: 'https://resolver.example',
  mediaHosts: ['cdn.example'],
  enabled: false,
};
describe('browser source admission', () => {
  it('rejects private, loopback and mapped addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '::1',
      '::ffff:8.8.8.8',
      'fe80::1',
      '2001:db8::1',
    ])
      expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true);
  });
  it('rejects credentials, unknown hosts, and browser-incompatible addon responses', () => {
    expect(() => secureUrl('https://user:pass@cdn.example/video.mp4', config.mediaHosts)).toThrow();
    const result = normalizeStreams(
      {
        streams: [
          { url: 'http://cdn.example/a.mp4' },
          { url: 'https://other.example/a.mp4' },
          {
            url: 'https://cdn.example/a.mp4',
            behaviorHints: { proxyHeaders: { request: { Referer: 'secret' } } },
          },
          { infoHash: 'hash' },
          { externalUrl: 'https://site.example' },
          { url: 'https://cdn.example/a.mkv' },
        ],
      },
      config,
    );
    expect(result).toEqual([]);
  });
  it('keeps only approved WebVTT subtitles and actual media formats', () => {
    expect(
      normalizeStreams(
        {
          streams: [
            {
              name: 'Japanese',
              url: 'https://cdn.example/a.m3u8',
              subtitles: [
                { lang: 'en', url: 'https://cdn.example/sub.vtt' },
                { lang: 'en', url: 'https://cdn.example/sub.srt' },
                { lang: 'ja', url: 'https://unknown.example/sub.vtt' },
              ],
            },
          ],
        },
        config,
      ),
    ).toEqual([
      expect.objectContaining({
        format: 'HLS',
        captions: [{ lang: 'en', label: 'English', url: 'https://cdn.example/sub.vtt' }],
      }),
    ]);
  });
});
