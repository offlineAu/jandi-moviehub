'use client';

import { guestSchema } from '@jandi/shared';
import { CalendarClock, DoorOpen, Lock, LogIn, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { PasswordInput } from '@/components/auth/password-input';
import { Logo } from '@/components/layout/logo';
import { Artwork } from '@/components/movies/artwork';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage, isApiError } from '@/lib/api';
import { useGuestSession, useMe } from '@/lib/queries/auth';
import {
  JOIN_ERROR_MESSAGES,
  useJoinRoom,
  useRoomByCode,
  type RoomPreview,
} from '@/lib/queries/rooms';
import { formatDate } from '@/lib/utils';
import { VisibilityBadge } from './room-card';
import { WatchRoom } from './watch-room';

function joinErrorText(error: unknown): string {
  if (isApiError(error)) return JOIN_ERROR_MESSAGES[error.code] ?? errorMessage(error);
  return errorMessage(error);
}

function LobbyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="film-grain relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_15%_0%,rgb(147_51_234/0.2),transparent_70%),radial-gradient(45%_40%_at_100%_100%,rgb(219_39_119/0.12),transparent_70%)]"
      />
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Logo />
        <Link href="/rooms" className="rounded text-sm text-muted hover:text-foreground focus-ring">
          All watch parties
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 outline-none sm:items-center sm:pt-0"
      >
        {children}
      </main>
    </div>
  );
}

function Lobby({
  preview,
  invite,
  onJoined,
}: {
  preview: RoomPreview;
  invite: string | null;
  onJoined: () => Promise<unknown>;
}) {
  const { room, access } = preview;
  const me = useMe();
  const pathname = usePathname();
  const join = useJoinRoom(room.code);
  const guest = useGuestSession();
  const [password, setPassword] = React.useState('');
  const [guestName, setGuestName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [guestError, setGuestError] = React.useState<string | null>(null);
  const user = me.data;
  const next = encodeURIComponent(
    `${pathname}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`,
  );
  const scheduled = room.scheduledFor ? new Date(room.scheduledFor) : null;
  const full = room.memberCount >= room.maxMembers;

  const doJoin = async () => {
    setError(null);
    try {
      await join.mutateAsync({
        roomId: room.id,
        password: password || undefined,
        inviteToken: invite ?? undefined,
      });
      await onJoined();
      toast.success(`Joined ${room.name}`);
    } catch (e) {
      setError(joinErrorText(e));
    }
  };

  const joinAsGuest = async () => {
    setGuestError(null);
    const parsed = guestSchema.safeParse({ displayName: guestName });
    if (!parsed.success) {
      setGuestError('Enter a display name (up to 40 characters).');
      return;
    }
    try {
      await guest.mutateAsync(parsed.data.displayName);
    } catch (e) {
      setGuestError(errorMessage(e, 'Couldn’t start a guest session.'));
      return;
    }
    await doJoin();
  };

  let action: React.ReactNode;
  if (access.banned) {
    action = <FormError message={JOIN_ERROR_MESSAGES.BANNED} />;
  } else if (room.status === 'CLOSED') {
    action = <FormError message={JOIN_ERROR_MESSAGES.ROOM_CLOSED} />;
  } else if (me.isLoading) {
    action = (
      <div className="flex justify-center py-2 text-muted">
        <Spinner className="size-5" label="Checking your session" />
      </div>
    );
  } else if (!user) {
    action = room.allowGuests ? (
      <div className="grid gap-4">
        <form
          noValidate
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void joinAsGuest();
          }}
        >
          <FormField
            label="Your name in the room"
            htmlFor="guest-name"
            error={guestError ?? undefined}
            hint="No account needed. Guest sessions last 24 hours."
          >
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              autoFocus
            />
          </FormField>
          {access.requiresPassword ? (
            <FormField label="Room password" htmlFor="room-password-guest">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
            </FormField>
          ) : null}
          <FormError message={error} />
          <Button
            type="submit"
            size="lg"
            loading={guest.isPending || join.isPending}
            loadingText="Joining"
          >
            <DoorOpen aria-hidden="true" />
            Continue as guest
          </Button>
        </form>
        <p className="text-center text-sm text-muted">
          Have an account?{' '}
          <Link href={`/login?next=${next}`} className="rounded font-medium link-fx focus-ring">
            Log in
          </Link>
        </p>
      </div>
    ) : (
      <div className="grid gap-3">
        <p className="text-sm text-muted">
          Log in or create a free account to join this watch party.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild size="lg">
            <Link href={`/login?next=${next}`}>
              <LogIn aria-hidden="true" />
              Log in to join
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={`/register?next=${next}`}>Create an account</Link>
          </Button>
        </div>
      </div>
    );
  } else if (user.isGuest && (access.guestBlocked || !room.allowGuests)) {
    action = (
      <div className="grid gap-3">
        <FormError message={JOIN_ERROR_MESSAGES.GUESTS_NOT_ALLOWED} />
        <Button asChild size="lg">
          <Link href={`/register?next=${next}`}>Create an account</Link>
        </Button>
      </div>
    );
  } else {
    action = (
      <form
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void doJoin();
        }}
      >
        {access.requiresPassword ? (
          <FormField label="Room password" htmlFor="room-password" error={undefined}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </FormField>
        ) : null}
        <FormError message={error} />
        <Button
          type="submit"
          size="lg"
          loading={join.isPending}
          loadingText="Joining"
          disabled={full || (access.requiresPassword && !password)}
        >
          <DoorOpen aria-hidden="true" />
          {full ? 'Room is full' : 'Join the watch party'}
        </Button>
        <p className="text-center text-xs text-muted">Joining as {user.displayName}</p>
      </form>
    );
  }

  return (
    <div className="w-full max-w-lg">
      <article className="ticket-sides overflow-hidden rounded-2xl border border-border-strong bg-surface/95 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] [--notch:12px]">
        {room.movie ? (
          <div className="relative h-36 overflow-hidden sm:h-44" aria-hidden="true">
            <Artwork
              src={room.movie.backdropUrl ?? room.movie.posterUrl}
              alt=""
              sizes="512px"
              kind="backdrop"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
          </div>
        ) : null}
        <div className="px-6 pb-6 pt-5 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityBadge visibility={room.visibility} />
            {room.onlineCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground/85">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                {room.onlineCount} watching now
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {room.name}
          </h1>
          {room.movie ? (
            <p className="mt-1 text-sm text-muted">Watching {room.movie.title}</p>
          ) : null}
          {room.description ? (
            <p className="mt-3 text-sm leading-relaxed text-foreground/85">{room.description}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <span className="flex items-center gap-2">
              <Avatar src={room.host.avatarUrl} name={room.host.displayName} size="xs" />
              Hosted by {room.host.displayName}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden="true" />
              {room.memberCount}/{room.maxMembers} members
            </span>
            {scheduled && !Number.isNaN(scheduled.getTime()) ? (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden="true" />
                {formatDate(room.scheduledFor)},{' '}
                {scheduled.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}
              </span>
            ) : null}
            {access.requiresPassword ? (
              <span className="flex items-center gap-1.5">
                <Lock className="size-4" aria-hidden="true" />
                Password required
              </span>
            ) : null}
          </div>
        </div>
        <div className="border-t-2 border-dashed border-white/10 px-6 py-5 sm:px-8">
          <p className="mb-4 flex items-center gap-2 text-xs text-muted">
            <Ticket className="size-4 text-primary" aria-hidden="true" />
            Room code{' '}
            <span className="font-display font-bold tracking-[0.16em] text-foreground">
              {room.code}
            </span>
          </p>
          {action}
        </div>
      </article>
    </div>
  );
}

export function RoomEntry({ code }: { code: string }) {
  const invite = useSearchParams().get('invite');
  const preview = useRoomByCode(code, invite);

  if (preview.isLoading) {
    return (
      <LobbyShell>
        <div className="w-full max-w-lg" aria-busy="true" aria-label="Loading room">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </LobbyShell>
    );
  }
  if (preview.isError || !preview.data) {
    const status = isApiError(preview.error) ? preview.error.status : 0;
    return (
      <LobbyShell>
        <div className="w-full max-w-lg">
          {status === 404 || status === 400 ? (
            <EmptyState
              icon={Ticket}
              title="Room not found or private"
              description="Check the code, or ask the host for an invite link. Private and friends-only rooms are hidden unless you’re invited."
              action={
                <Button asChild variant="secondary">
                  <Link href="/rooms">Browse watch parties</Link>
                </Button>
              }
            />
          ) : (
            <ErrorState
              title="The room didn’t load"
              error={preview.error}
              onRetry={() => void preview.refetch()}
              retrying={preview.isFetching}
            />
          )}
        </div>
      </LobbyShell>
    );
  }

  const data = preview.data;
  if (data.access.isMember && data.room.status === 'OPEN') return <WatchRoom room={data.room} />;
  return (
    <LobbyShell>
      <Lobby preview={data} invite={invite} onJoined={() => preview.refetch()} />
    </LobbyShell>
  );
}
