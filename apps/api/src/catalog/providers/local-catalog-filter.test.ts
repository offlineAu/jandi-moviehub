import { describe, expect, it } from 'vitest';
import { localListQuery } from './local-catalog.provider';

describe('local catalog', () => {
  it('lists the local catalog, including the playable originals', () => {
    // The seeded Jandi Originals are the catalog's only streamable films. Excluding them from the
    // listing leaves a browse page with nothing playable on it.
    const { where } = localListQuery({ page: 1, pageSize: 20 });
    expect(where.AND).toContainEqual({ source: 'LOCAL' });
    expect(where.AND).not.toContainEqual({ isDemo: false });
  });

  it('lists playable originals when playable titles are requested', () => {
    const { where } = localListQuery({ page: 1, pageSize: 20, playable: true });
    expect(where.AND).not.toContainEqual({ isDemo: false });
    expect(where.AND).toContainEqual(
      expect.objectContaining({ mediaAssets: expect.objectContaining({ some: expect.anything() }) }),
    );
  });

  it('keeps unplayable titles out of the playable list', () => {
    const { where } = localListQuery({ page: 1, pageSize: 20, playable: false });
    expect(where.AND).toContainEqual(
      expect.objectContaining({ NOT: expect.objectContaining({ mediaAssets: expect.anything() }) }),
    );
  });
});
