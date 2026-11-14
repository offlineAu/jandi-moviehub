'use client';

import { SocketEvents, type CommandAck, type MarathonSnapshot } from '@jandi/shared';
import {
  Ban,
  Check,
  ListVideo,
  Play,
  RotateCw,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Vote,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { formatTime } from '@/components/player/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import {
  useConfigureMarathon,
  useMarathonCommand,
  useMyPlaylists,
  useRemoveMarathon,
  type MarathonCommand,
} from '@/lib/queries/rooms';
import { cn, formatRuntime } from '@/lib/utils';

export const MARATHON_STATE_LABEL: Record<MarathonSnapshot['state'], string> = {
  IDLE: 'Not started',
  READY: 'Ready',
  COUNTDOWN: 'Starting',
  PLAYING: 'Playing',
  INTERMISSION: 'Intermission',
  TRANSITIONING: 'Loading next',
  COMPLETED: 'Finished',
  ERROR: 'Stopped by an error',
};

export const ACTIVE_MARATHON_STATES: ReadonlyArray<MarathonSnapshot['state']> = [
  'READY',
  'COUNTDOWN',
  'PLAYING',
  'INTERMISSION',
  'TRANSITIONING',
  'ERROR',
];

/** Seconds left until `phaseEndsAt` (server clock), re-rendering every 250 ms while active. */
export function usePhaseRemaining(
  phaseEndsAt: number | null,
  serverNow: () => number,
): number | null {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!phaseEndsAt) return;
    const t = window.setInterval(force, 250);
    return () => window.clearInterval(t);
  }, [phaseEndsAt]);
  if (!phaseEndsAt) return null;
  return Math.max(0, Math.ceil((phaseEndsAt - serverNow()) / 1000));
}

function SetupDialog({
  roomId,
  open,
  onOpenChange,
  onConfigured,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfigured: (m: MarathonSnapshot) => void;
}) {
  const playlists = useMyPlaylists(open);
  const configure = useConfigureMarathon();
  const [playlistId, setPlaylistId] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState(10);
  const [intermission, setIntermission] = React.useState(30);
  const [voting, setVoting] = React.useState(false);
  const valid =
    !!playlistId && countdown >= 0 && countdown <= 60 && intermission >= 0 && intermission <= 1800;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up a marathon</DialogTitle>
          <DialogDescription>
            Pick one of your playlists. Titles play in order for everyone in the room.
          </DialogDescription>
        </DialogHeader>
        {playlists.isLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : playlists.isError ? (
          <p className="text-sm text-danger">
            Your playlists didn’t load. Close this and try again.
          </p>
        ) : !playlists.data?.items.length ? (
          <div className="rounded-xl border border-dashed border-border-strong p-5 text-center text-sm text-muted">
            You don’t have any playlists yet.{' '}
            <Link href="/playlists" className="font-medium link-fx">
              Create one
            </Link>{' '}
            and come back.
          </div>
        ) : (
          <ul
            className="grid max-h-64 gap-1.5 overflow-y-auto"
            role="radiogroup"
            aria-label="Playlist"
          >
            {playlists.data.items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={playlistId === p.id}
                  disabled={p.playableCount === 0}
                  onClick={() => setPlaylistId(p.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-3 text-left focus-ring disabled:cursor-not-allowed disabled:opacity-50',
                    playlistId === p.id
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border-strong hover:border-white/20',
                  )}
                >
                  <ListVideo className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {p.playableCount} of {p.itemCount} playable
                      {p.totalRuntimeSec
                        ? `, ${formatRuntime(Math.round(p.totalRuntimeSec / 60))}`
                        : ''}
                    </span>
                  </span>
                  {playlistId === p.id ? (
                    <Check className="size-4 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Countdown (s)" htmlFor="setup-countdown" hint="0–60">
            <Input
              type="number"
              min={0}
              max={60}
              value={countdown}
              onChange={(e) => setCountdown(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Intermission (s)" htmlFor="setup-intermission" hint="0–1800">
            <Input
              type="number"
              min={0}
              max={1800}
              value={intermission}
              onChange={(e) => setIntermission(Number(e.target.value))}
            />
          </FormField>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="setup-voting">Vote on the next title during intermission</Label>
          <Switch id="setup-voting" checked={voting} onCheckedChange={setVoting} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            loading={configure.isPending}
            loadingText="Setting up"
            onClick={() =>
              configure.mutate(
                {
                  roomId,
                  playlistId: playlistId!,
                  countdownSec: countdown,
                  intermissionSec: intermission,
                  votingEnabled: voting,
                },
                {
                  onSuccess: ({ marathon }) => {
                    toast.success('Marathon ready — press Start when everyone’s here');
                    onConfigured(marathon);
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error(errorMessage(e, 'Couldn’t set up the marathon.')),
                },
              )
            }
          >
            Set up marathon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MarathonPanel({
  roomId,
  marathon,
  setMarathon,
  isHost,
  socket,
  serverNow,
  className,
}: {
  roomId: string;
  marathon: MarathonSnapshot | null;
  setMarathon: (m: MarathonSnapshot | null) => void;
  isHost: boolean;
  socket: Socket | null;
  serverNow: () => number;
  className?: string;
}) {
  const command = useMarathonCommand(roomId);
  const remove = useRemoveMarathon(roomId);
  const [setupOpen, setSetupOpen] = React.useState(false);
  const remaining = usePhaseRemaining(marathon?.phaseEndsAt ?? null, serverNow);

  const run = (c: MarathonCommand) =>
    command.mutate(c, {
      onSuccess: ({ marathon: m }) => setMarathon(m),
      onError: (e) => toast.error(errorMessage(e, 'The marathon couldn’t do that right now.')),
    });

  const vote = async (playlistItemId: string) => {
    if (!socket) return;
    try {
      const ack = (await socket.timeout(5000).emitWithAck(SocketEvents.MARATHON_VOTE, {
        roomId,
        playlistItemId,
      })) as CommandAck<MarathonSnapshot>;
      if (!ack.ok) toast.error(ack.error.message);
      else if (ack.data && typeof ack.data === 'object' && 'state' in ack.data)
        setMarathon(ack.data);
    } catch {
      toast.error('Vote not sent — check your connection.');
    }
  };

  if (!marathon) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col p-4', className)}>
        <EmptyState
          icon={ListVideo}
          title="No marathon in this room"
          description={
            isHost
              ? 'Turn one of your playlists into a marathon: titles play back to back with a countdown and intermissions.'
              : 'The host can line up a playlist to play back to back.'
          }
          action={
            isHost ? <Button onClick={() => setSetupOpen(true)}>Set up marathon</Button> : null
          }
          className="py-10"
        />
        {isHost ? (
          <SetupDialog
            roomId={roomId}
            open={setupOpen}
            onOpenChange={setSetupOpen}
            onConfigured={setMarathon}
          />
        ) : null}
      </div>
    );
  }

  const { state, items, currentIndex } = marathon;
  const busy = command.isPending;
  const votingOpen = state === 'INTERMISSION' && marathon.votingEnabled;
  const eta = marathon.estimatedFinishAt ? new Date(marathon.estimatedFinishAt) : null;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Badge
            variant={
              state === 'PLAYING' || state === 'COUNTDOWN'
                ? 'live'
                : state === 'ERROR'
                  ? 'danger'
                  : 'neutral'
            }
          >
            {MARATHON_STATE_LABEL[state]}
            {remaining !== null && (state === 'COUNTDOWN' || state === 'INTERMISSION')
              ? ` ${formatTime(remaining)}`
              : ''}
          </Badge>
          <p className="text-xs text-muted">
            {formatRuntime(Math.round(marathon.totalRuntimeSec / 60)) ?? '—'} total
            {eta && state !== 'COMPLETED'
              ? `, ends ~${eta.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
        {marathon.error ? <p className="mt-2 text-xs text-danger">{marathon.error}</p> : null}
        {isHost ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {state === 'READY' || state === 'IDLE' ? (
              <Button size="sm" onClick={() => run('start')} loading={busy} loadingText="Starting">
                <Play className="fill-current" aria-hidden="true" />
                Start marathon
              </Button>
            ) : null}
            {['COUNTDOWN', 'PLAYING', 'INTERMISSION', 'TRANSITIONING'].includes(state) ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => run('previous')}
                  disabled={busy || currentIndex <= 0}
                >
                  <SkipBack aria-hidden="true" />
                  Previous
                </Button>
                <Button size="sm" variant="secondary" onClick={() => run('skip')} disabled={busy}>
                  <SkipForward aria-hidden="true" />
                  Skip
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run('stop')} disabled={busy}>
                  <Square aria-hidden="true" />
                  Stop
                </Button>
              </>
            ) : null}
            {state === 'ERROR' ? (
              <>
                <Button
                  size="sm"
                  onClick={() => run('retry')}
                  loading={busy}
                  loadingText="Retrying"
                >
                  <RotateCw aria-hidden="true" />
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run('stop')} disabled={busy}>
                  <Square aria-hidden="true" />
                  Stop
                </Button>
              </>
            ) : null}
            {state === 'COMPLETED' || state === 'IDLE' ? (
              <Button
                size="sm"
                variant="ghost"
                loading={remove.isPending}
                loadingText="Removing"
                onClick={() =>
                  remove.mutate(undefined, {
                    onSuccess: () => {
                      setMarathon(null);
                      toast.success('Marathon removed');
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Trash2 aria-hidden="true" />
                Remove marathon
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {votingOpen ? (
        <p className="flex items-center gap-2 border-b border-border bg-primary/[0.08] px-4 py-2 text-xs">
          <Vote className="size-4 text-primary" aria-hidden="true" />
          Vote for what plays next{remaining !== null ? ` — ${formatTime(remaining)} left` : ''}.
        </p>
      ) : null}

      <ol className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label="Marathon lineup">
        {items.map((item, i) => {
          const current =
            i === currentIndex && state !== 'COMPLETED' && state !== 'READY' && state !== 'IDLE';
          const next =
            i === currentIndex + 1 || ((state === 'READY' || state === 'IDLE') && i === 0);
          const done = i < currentIndex || state === 'COMPLETED';
          const votes = marathon.votes[item.id] ?? 0;
          const canVote = votingOpen && i > currentIndex && item.playable;
          return (
            <li
              key={item.id}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-2 py-2',
                current && 'bg-glass-2 ring-1 ring-primary/40',
                done && 'opacity-50',
              )}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                  current ? 'bg-brand text-white' : 'bg-glass-2 text-muted',
                )}
              >
                {done && !current ? <Check className="size-3.5" aria-label="Played" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted">
                  {current
                    ? state === 'COUNTDOWN'
                      ? 'Starting soon'
                      : state === 'INTERMISSION'
                        ? 'Just played'
                        : 'Now playing'
                    : next && !done
                      ? 'Up next'
                      : item.durationSec
                        ? formatTime(item.durationSec)
                        : ''}
                  {!item.playable ? (
                    <span className="ml-1 inline-flex items-center gap-1 text-danger">
                      <Ban className="size-3" aria-hidden="true" />
                      Not playable, will be skipped
                    </span>
                  ) : null}
                </p>
              </div>
              {canVote ? (
                <Button
                  size="sm"
                  variant={marathon.myVote === item.id ? 'primary' : 'outline'}
                  aria-pressed={marathon.myVote === item.id}
                  onClick={() => void vote(item.id)}
                >
                  {votes} {votes === 1 ? 'vote' : 'votes'}
                </Button>
              ) : votingOpen && votes ? (
                <span className="text-xs text-muted">{votes}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Countdown / intermission card shown over the player. */
export function MarathonOverlay({
  marathon,
  serverNow,
}: {
  marathon: MarathonSnapshot | null;
  serverNow: () => number;
}) {
  const remaining = usePhaseRemaining(marathon?.phaseEndsAt ?? null, serverNow);
  if (
    !marathon ||
    (marathon.state !== 'COUNTDOWN' &&
      marathon.state !== 'INTERMISSION' &&
      marathon.state !== 'TRANSITIONING')
  )
    return null;
  const current = marathon.items[marathon.currentIndex];
  const next =
    marathon.state === 'INTERMISSION' ? marathon.items[marathon.currentIndex + 1] : current;
  return (
    <div className="pointer-events-none! absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div
        className="ticket-sides rounded-2xl border border-border-strong bg-surface/95 px-8 py-6 text-center shadow-2xl"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-muted">
          {marathon.state === 'COUNTDOWN'
            ? 'Starting in'
            : marathon.state === 'INTERMISSION'
              ? 'Intermission'
              : 'Loading the next title'}
        </p>
        {remaining !== null && marathon.state !== 'TRANSITIONING' ? (
          <p className="font-display text-6xl font-bold tabular-nums tracking-tight text-white sm:text-7xl">
            {marathon.state === 'COUNTDOWN' ? remaining : formatTime(remaining)}
          </p>
        ) : null}
        {next ? (
          <p className="mt-2 max-w-xs text-sm text-foreground/85">
            {marathon.state === 'INTERMISSION' ? 'Up next: ' : ''}
            <span className="font-semibold">{next.title}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
