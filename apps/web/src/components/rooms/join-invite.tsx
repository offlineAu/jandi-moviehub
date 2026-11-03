'use client';

import { CalendarClock, DoorOpen, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Logo } from '@/components/layout/logo';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FormError } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, isApiError } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';
import { JOIN_ERROR_MESSAGES, useInvitePreview, useJoinRoom } from '@/lib/queries/rooms';
import { formatRelative } from '@/lib/utils';
import { RoomCard } from './room-card';

export function JoinInvite({ token }: { token: string }) {
  const router = useRouter();
  const me = useMe();
  const preview = useInvitePreview(token);
  const join = useJoinRoom(preview.data?.room.code ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const room = preview.data?.room;
  const lobbyHref = room ? `/rooms/${room.code}?invite=${encodeURIComponent(token)}` : '/rooms';
  const user = me.data;
  const canJoinHere = !!user && !(user.isGuest && room && !room.allowGuests);

  const accept = async () => {
    if (!room) return;
    setError(null);
    try {
      await join.mutateAsync({ roomId: room.id, inviteToken: token });
      toast.success(`Joined ${room.name}`);
      router.push(`/rooms/${room.code}`);
    } catch (e) {
      setError(isApiError(e) ? (JOIN_ERROR_MESSAGES[e.code] ?? errorMessage(e)) : errorMessage(e));
    }
  };

  return (
    <div className="film-grain relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_0%,rgb(147_51_234/0.22),transparent_70%)]"
      />
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 outline-none sm:items-center sm:pt-0"
      >
        <div className="grid w-full max-w-md gap-5">
          {preview.isLoading ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : preview.isError || !room ? (
            isApiError(preview.error) && preview.error.status === 404 ? (
              <EmptyState
                icon={Ticket}
                title="This invite has expired"
                description="Invite links stop working after they expire or run out of uses. Ask the host for a new one."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/rooms">Browse watch parties</Link>
                  </Button>
                }
              />
            ) : (
              <ErrorState
                title="The invite didn’t load"
                error={preview.error}
                onRetry={() => void preview.refetch()}
              />
            )
          ) : (
            <>
              <div className="text-center">
                <p className="flex items-center justify-center gap-2 text-sm text-muted">
                  <Avatar src={room.host.avatarUrl} name={room.host.displayName} size="xs" />
                  {room.host.displayName} invited you to a watch party
                </p>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{room.name}</h1>
              </div>
              <RoomCard room={room} href={lobbyHref} />
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                Invite expires {formatRelative(preview.data!.invite.expiresAt)}
              </p>
              <FormError message={error} />
              {me.isLoading ? (
                <Skeleton className="h-12 rounded-xl" />
              ) : canJoinHere ? (
                <Button
                  size="lg"
                  onClick={() => void accept()}
                  loading={join.isPending}
                  loadingText="Joining"
                >
                  <DoorOpen aria-hidden="true" />
                  Accept and join
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link href={lobbyHref}>
                    <DoorOpen aria-hidden="true" />
                    {room.allowGuests ? 'Continue to join' : 'Log in to join'}
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
