import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SponsorCard } from './sponsor-card';

const sponsor = {
  name: 'Example sponsor',
  message: 'Movie night supplies',
  url: 'https://example.com/',
  startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-12-01T00:00:00Z',
};

afterEach(() => vi.restoreAllMocks());

describe('SponsorCard', () => {
  it('labels an active campaign and marks its link as sponsored', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-15T00:00:00Z'));
    render(<SponsorCard sponsor={sponsor} />);
    const link = await screen.findByRole('link', { name: /visit sponsor/i });
    expect(screen.getByText('Sponsored')).toBeTruthy();
    expect(link.getAttribute('rel')).toContain('sponsored');
  });
  it('does not show an expired or future campaign', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-12-01T00:00:00Z'));
    const { rerender } = render(<SponsorCard sponsor={sponsor} />);
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T00:00:00Z'));
    rerender(<SponsorCard sponsor={{ ...sponsor }} />);
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
  });
});
