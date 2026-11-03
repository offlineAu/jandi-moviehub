import { describe, expect, it } from 'vitest';
import { formatRuntime, initials, safeNextPath } from './utils';

describe('safeNextPath', () => {
  it.each([
    ['/library?tab=history', '/library?tab=history'],
    ['%2Fwatch%2Fabc', '/watch/abc'],
    ['https://evil.example/', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
    [null, '/'],
    ['', '/'],
  ])('sanitises %s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('formatting', () => {
  it('formats runtimes and initials', () => {
    expect(formatRuntime(135)).toBe('2h 15m');
    expect(formatRuntime(45)).toBe('45m');
    expect(formatRuntime(null)).toBeNull();
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('neo')).toBe('NE');
    expect(initials('Guest Gus (guest)')).toBe('GG');
  });
});
