import { describe, expect, it } from 'vitest';
import { matchesSeries } from './external-episodes';

describe('external series matching', () => {
  it('matches exact titles and explicit seasons while excluding unrelated titles', () => {
    expect(matchesSeries('Money Heist - Season 1', 'Money Heist')).toBe(true);
    expect(matchesSeries('Money Heist: Part 2', 'Money Heist')).toBe(true);
    expect(matchesSeries('Money Honey Brainy', 'Money Heist')).toBe(false);
    expect(matchesSeries('Money Heist Korea', 'Money Heist')).toBe(false);
  });
});
