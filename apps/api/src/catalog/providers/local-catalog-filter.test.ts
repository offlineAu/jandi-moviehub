import { describe, expect, it } from 'vitest';
import { localListQuery } from './local-catalog.provider';

describe('local catalog', () => {
  it('excludes generated demos from discovery', () => {
    const { where } = localListQuery({ page: 1, pageSize: 20 });
    expect(where.AND).toContainEqual({ isDemo: false });
  });
});
