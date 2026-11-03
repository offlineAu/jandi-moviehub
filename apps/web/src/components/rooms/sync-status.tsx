'use client';

import { Tooltip } from '@/components/ui/tooltip';
import type { SyncStats } from '@/lib/sync/room-sync';
import { cn } from '@/lib/utils';

/** Connection + sync health from the engine's real measurements (drift, round-trip time). */
export function SyncStatus({
  connected,
  joined,
  stats,
}: {
  connected: boolean;
  joined: boolean;
  stats: SyncStats | null;
  buffering?: boolean;
}) {
  const drift = stats?.driftMs ?? null;
  let tone: 'ok' | 'warn' | 'bad' = 'ok';
  let label = 'In sync';
  if (!connected) {
    tone = 'bad';
    label = 'Reconnecting';
  } else if (!joined) {
    tone = 'warn';
    label = 'Joining';
  } else if (drift !== null && Math.abs(drift) >= 1000) {
    tone = 'warn';
    label = 'Catching up';
  } else if (drift !== null && Math.abs(drift) >= 150) {
    label = 'Adjusting';
  }
  const details = [
    drift !== null ? `Drift ${drift > 0 ? '+' : ''}${drift} ms` : 'Drift not measured yet',
    stats ? `round trip ${stats.rttMs} ms` : null,
    stats
      ? `${stats.corrections.seeks} seek and ${stats.corrections.rateNudges} speed corrections`
      : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Tooltip
      label={connected ? details : 'Lost connection to the room. Reconnecting automatically.'}
    >
      <span
        tabIndex={0}
        role="status"
        aria-label={`${label}. ${connected ? details : ''}`}
        className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border-strong bg-white/[0.03] px-3 text-xs font-medium focus-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full',
            tone === 'ok' && 'bg-success shadow-[0_0_8px_rgb(52_211_153/0.8)]',
            tone === 'warn' && 'bg-warning',
            tone === 'bad' && 'animate-pulse bg-danger',
          )}
        />
        <span>{label}</span>
        {connected && joined && drift !== null ? (
          <span className="hidden tabular-nums text-muted md:inline">{Math.abs(drift)} ms</span>
        ) : null}
        {connected && stats ? (
          <span className="hidden tabular-nums text-subtle xl:inline">RTT {stats.rttMs} ms</span>
        ) : null}
      </span>
    </Tooltip>
  );
}
