import { describe, expect, it } from 'vitest';
import { isAssetPlayable } from './playability';

const now = new Date('2026-06-01T00:00:00Z');
const license = (
  o: Partial<{ verifiedAt: Date | null; validFrom: Date | null; validUntil: Date | null }> = {},
) => ({
  verifiedAt: new Date('2026-01-01'),
  validFrom: null,
  validUntil: null,
  ...o,
});

describe('isAssetPlayable', () => {
  it('requires APPROVED + verified license inside its window', () => {
    expect(isAssetPlayable({ status: 'APPROVED', license: license() }, now)).toBe(true);
    expect(isAssetPlayable({ status: 'PENDING', license: license() }, now)).toBe(false);
    expect(
      isAssetPlayable({ status: 'APPROVED', license: license({ verifiedAt: null }) }, now),
    ).toBe(false);
    expect(
      isAssetPlayable(
        { status: 'APPROVED', license: license({ validFrom: new Date('2026-07-01') }) },
        now,
      ),
    ).toBe(false);
    expect(
      isAssetPlayable(
        { status: 'APPROVED', license: license({ validUntil: new Date('2026-05-01') }) },
        now,
      ),
    ).toBe(false);
    expect(
      isAssetPlayable(
        {
          status: 'APPROVED',
          license: license({
            validFrom: new Date('2026-01-01'),
            validUntil: new Date('2027-01-01'),
          }),
        },
        now,
      ),
    ).toBe(true);
  });
});
