import { describe, expect, it } from 'vitest';
import { sponsorFromEnv, supportUrlFromEnv } from './monetization';

const campaign = {
  SPONSOR_ENABLED: 'true',
  SPONSOR_NAME: 'Example sponsor',
  SPONSOR_MESSAGE: 'Movie night supplies',
  SPONSOR_URL: 'https://example.com/offer',
  SPONSOR_STARTS_AT: '2026-11-01T00:00:00Z',
  SPONSOR_ENDS_AT: '2026-12-01T00:00:00Z',
};

describe('monetization configuration', () => {
  it('requires explicit activation and a complete campaign', () => {
    expect(sponsorFromEnv({})).toBeNull();
    expect(sponsorFromEnv({ ...campaign, SPONSOR_ENABLED: 'false' })).toBeNull();
    expect(sponsorFromEnv({ ...campaign, SPONSOR_MESSAGE: '' })).toBeNull();
    expect(sponsorFromEnv(campaign)).toMatchObject({ name: 'Example sponsor' });
  });
  it('rejects unsafe destinations and ambiguous or reversed dates', () => {
    for (const url of [
      'javascript:alert(1)',
      'http://example.com',
      'https://user:pass@example.com',
    ]) {
      expect(sponsorFromEnv({ ...campaign, SPONSOR_URL: url })).toBeNull();
    }
    expect(sponsorFromEnv({ ...campaign, SPONSOR_ENDS_AT: '2026-12-01' })).toBeNull();
    expect(sponsorFromEnv({ ...campaign, SPONSOR_ENDS_AT: campaign.SPONSOR_STARTS_AT })).toBeNull();
  });
  it('requires explicit activation and an HTTPS support URL', () => {
    expect(supportUrlFromEnv({ SUPPORT_URL: 'https://example.com' })).toBeNull();
    expect(
      supportUrlFromEnv({ SUPPORT_ENABLED: 'true', SUPPORT_URL: 'javascript:alert(1)' }),
    ).toBeNull();
    expect(supportUrlFromEnv({ SUPPORT_ENABLED: 'true', SUPPORT_URL: 'https://example.com' })).toBe(
      'https://example.com/',
    );
  });
});
