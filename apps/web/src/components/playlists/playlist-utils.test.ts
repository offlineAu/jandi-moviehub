import { describe, expect, it } from 'vitest';
import {
  describeTotalRuntime,
  dropIndex,
  formatTotalRuntime,
  moveItem,
  orderChanged,
  pluralize,
} from './playlist-utils';

describe('formatTotalRuntime', () => {
  it('handles empty and invalid totals', () => {
    expect(formatTotalRuntime(0)).toBe('0m');
    expect(formatTotalRuntime(null)).toBe('0m');
    expect(formatTotalRuntime(-30)).toBe('0m');
    expect(formatTotalRuntime(Number.NaN)).toBe('0m');
  });
  it('formats sub-minute, minutes and hours', () => {
    expect(formatTotalRuntime(20)).toBe('<1m');
    expect(formatTotalRuntime(45 * 60)).toBe('45m');
    expect(formatTotalRuntime(2 * 3600)).toBe('2h');
    expect(formatTotalRuntime(2 * 3600 + 5 * 60)).toBe('2h 5m');
  });
  it('rounds to the nearest minute and carries into hours', () => {
    expect(formatTotalRuntime(59 * 60 + 40)).toBe('1h');
    expect(formatTotalRuntime(5 * 3600 + 29)).toBe('5h');
    expect(formatTotalRuntime(10 * 3600 + 31 * 60 + 31)).toBe('10h 32m');
  });
});

describe('describeTotalRuntime', () => {
  it('spells out hours and minutes', () => {
    expect(describeTotalRuntime(0)).toBe('no runtime');
    expect(describeTotalRuntime(30)).toBe('1 minute');
    expect(describeTotalRuntime(3600)).toBe('1 hour');
    expect(describeTotalRuntime(2 * 3600 + 60)).toBe('2 hours 1 minute');
  });
});

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];
  it('moves forward and backward without mutating the input', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
  it('clamps targets and ignores invalid sources', () => {
    expect(moveItem(list, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(list, 2, -5)).toEqual(['c', 'a', 'b', 'd']);
    expect(moveItem(list, 7, 0)).toEqual(list);
    expect(moveItem(list, 1, 1)).toEqual(list);
  });
});

describe('dropIndex', () => {
  const mids = [50, 150, 250];
  it('counts the midpoints above the pointer', () => {
    expect(dropIndex(0, mids)).toBe(0);
    expect(dropIndex(51, mids)).toBe(1);
    expect(dropIndex(200, mids)).toBe(2);
    expect(dropIndex(999, mids)).toBe(3);
    expect(dropIndex(10, [])).toBe(0);
  });
  it('composes with moveItem for a drag from the top to the bottom', () => {
    const order = ['a', 'b', 'c', 'd'];
    // dragging "a" (index 0) below "d": other rows' midpoints are all above the pointer
    expect(moveItem(order, 0, dropIndex(400, mids))).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('orderChanged / pluralize', () => {
  it('detects order differences', () => {
    expect(orderChanged(['a', 'b'], ['a', 'b'])).toBe(false);
    expect(orderChanged(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(orderChanged(['a'], ['a', 'b'])).toBe(true);
  });
  it('pluralizes', () => {
    expect(pluralize(1, 'movie')).toBe('1 movie');
    expect(pluralize(3, 'movie')).toBe('3 movies');
    expect(pluralize(0, 'person', 'people')).toBe('0 people');
  });
});
