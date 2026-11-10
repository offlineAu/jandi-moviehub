import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SyncStatus } from './sync-status';
import { TooltipProvider } from '@/components/ui/tooltip';

const stats = {
  driftMs: 300,
  buffering: false,
  offsetMs: 0,
  rttMs: 50,
  corrections: { seeks: 0, rateNudges: 1 },
};

it('shows small measured drift as in sync and reports buffering separately', () => {
  const { rerender } = render(<SyncStatus connected joined hasMedia stats={stats} />, {
    wrapper: TooltipProvider,
  });
  expect(screen.getByRole('status').getAttribute('aria-label')).toContain('In sync. Drift +300 ms');
  rerender(
    <SyncStatus connected joined hasMedia stats={{ ...stats, buffering: true, driftMs: -4000 }} />,
  );
  expect(screen.getByRole('status').getAttribute('aria-label')).toContain(
    'Buffering. Drift -4000 ms',
  );
  rerender(<SyncStatus connected joined hasMedia stats={{ ...stats, driftMs: -2500 }} />);
  expect(screen.getByRole('status').getAttribute('aria-label')).toContain('Catching up.');
});
