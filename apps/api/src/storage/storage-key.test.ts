import { describe, expect, it } from 'vitest';
import { assertSafeKey, isSafeKey, resolveInside } from './storage-key';

describe('storage keys', () => {
  it('accepts normal nested keys', () => {
    expect(assertSafeKey('demo/neon-drift/video.webm')).toBe('demo/neon-drift/video.webm');
    expect(isSafeKey('avatars/abc-123.png')).toBe(true);
  });

  it.each([
    '',
    '/etc/passwd',
    '../secret',
    'demo/../../etc/passwd',
    'demo/./x',
    'demo//x',
    'demo\\x',
    'demo/x\0',
    'demo/%2e%2e/x',
    'demo/a b',
  ])('rejects %j', (key) => {
    expect(isSafeKey(key)).toBe(false);
  });

  it('resolves inside the root only', () => {
    expect(resolveInside('/srv/storage', 'demo/a.webm')).toBe('/srv/storage/demo/a.webm');
    expect(() => resolveInside('/srv/storage', '../storage2/a')).toThrow();
  });
});
