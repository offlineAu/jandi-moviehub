import { describe, expect, it } from 'vitest';
import { computeProgress } from './history.service';

describe('computeProgress', () => {
  it('marks completion at 95 %', () => {
    expect(computeProgress(94, 100)).toEqual({ positionSec: 94, completed: false });
    expect(computeProgress(95, 100)).toEqual({ positionSec: 95, completed: true });
  });
  it('clamps to the duration and never completes without one', () => {
    expect(computeProgress(500, 100)).toEqual({ positionSec: 100, completed: true });
    expect(computeProgress(5000, null)).toEqual({ positionSec: 5000, completed: false });
  });
});
