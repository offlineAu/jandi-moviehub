'use client';

import { SocketEvents, type CommandAck, type PlaybackState } from '@jandi/shared';
import { Check, Copy, Link2, Send } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PasswordInput } from '@/components/auth/password-input';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { TicketCode } from '@/components/ui/ticket-stub';
import { errorMessage, isApiError } from '@/lib/api';
import {
  useCreateInvite,
  useFriendsList,
  useUpdateRoom,
  type Room,
  type RoomInvite,
} from '@/lib/queries/rooms';
import type { RoomSyncEngine } from '@/lib/sync/room-sync';
import type { Socket } from 'socket.io-client';
import { MoviePicker } from './movie-picker';
import {
  ControlPolicyRadio,
  fromLocalInput,
  toLocalInput,
  VisibilityRadio,
} from './room-form-fields';

/** Invite links always point at this web origin (the API's configured URL may differ in dev). */
function absoluteInviteUrl(invite: RoomInvite): string {
  return `${window.location.origin}/join/${encodeURIComponent(invite.token)}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function InviteDialog({
  room,
  open,
  onOpenChange,
  canInvite,
}: {
  room: Room;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canInvite: boolean;
}) {
  const create = useCreateInvite(room.id);
  const friends = useFriendsList(open && canInvite);
  const [invite, setInvite] = React.useState<RoomInvite | null>(null);
  const [copied, setCopied] = React.useState<'link' | 'code' | null>(null);
  const [sentTo, setSentTo] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) {
      setCopied(null);
      return;
    }
    if (!canInvite || invite || create.isPending) return;
    create.mutate({ expiresInHours: 72 }, { onSuccess: ({ invite: inv }) => setInvite(inv) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canInvite]);

  const url = invite ? absoluteInviteUrl(invite) : '';
  const doCopy = async (what: 'link' | 'code') => {
    const ok = await copy(what === 'link' ? url : room.code);
    if (ok) {
      setCopied(what);
      toast.success(what === 'link' ? 'Invite link copied' : 'Room code copied');
    } else toast.error('Couldn’t copy. Select the text and copy it manually.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            {room.visibility === 'PUBLIC'
              ? 'Anyone can join with the room code. An invite link takes them straight in.'
              : 'Share an invite link — it lets people into this room for the next 3 days.'}
          </DialogDescription>
        </DialogHeader>

        <TicketCode code={room.code} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void doCopy('code')}
          className="-mt-2 justify-self-start"
        >
          {copied === 'code' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          Copy room code
        </Button>

        {canInvite ? (
          <div className="grid gap-2">
            <Label htmlFor="invite-link">Invite link</Label>
            {create.isPending && !invite ? (
              <Skeleton className="h-11 rounded-[10px]" />
            ) : create.isError ? (
              <p className="text-sm text-danger">
                {errorMessage(create.error, 'The invite link couldn’t be created.')}{' '}
                <button
                  type="button"
                  className="link-fx font-medium"
                  onClick={() =>
                    create.mutate(
                      { expiresInHours: 72 },
                      { onSuccess: ({ invite: inv }) => setInvite(inv) },
                    )
                  }
                >
                  Try again
                </button>
              </p>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button onClick={() => void doCopy('link')} aria-label="Copy invite link">
                  {copied === 'link' ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
                  Copy
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Only the host and co-hosts can create invite links for this room.
          </p>
        )}

        {canInvite ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Invite a friend</p>
            {friends.isLoading ? (
              <Skeleton className="h-12 rounded-xl" />
            ) : friends.isError ? (
              <p className="text-sm text-muted">
                {isApiError(friends.error) && friends.error.status === 403
                  ? 'Guests can’t invite friends.'
                  : 'Friends didn’t load.'}
              </p>
            ) : !friends.data?.items.length ? (
              <p className="text-sm text-muted">Add friends to invite them here with one click.</p>
            ) : (
              <ul className="grid max-h-48 gap-1 overflow-y-auto">
                {friends.data.items.map((f) => {
                  const sent = sentTo.has(f.user.id);
                  return (
                    <li key={f.user.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                      <Avatar src={f.user.avatarUrl} name={f.user.displayName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {f.user.displayName}
                        </span>
                        <span className="block text-xs text-muted">
                          {f.online ? 'Online' : `@${f.user.username}`}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant={sent ? 'ghost' : 'secondary'}
                        disabled={sent}
                        onClick={() =>
                          create.mutate(
                            { expiresInHours: 72, inviteeUserId: f.user.id, maxUses: 1 },
                            {
                              onSuccess: () => {
                                setSentTo((s) => new Set(s).add(f.user.id));
                                toast.success(`Invite sent to ${f.user.displayName}`);
                              },
                              onError: (e) => toast.error(errorMessage(e, 'Invite not sent.')),
                            },
                          )
                        }
                      >
                        {sent ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}
                        {sent ? 'Sent' : 'Invite'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function RoomSettingsDialog({
  room,
  open,
  onOpenChange,
}: {
  room: Room;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateRoom(room.id);
  const [name, setName] = React.useState(room.name);
  const [description, setDescription] = React.useState(room.description ?? '');
  const [visibility, setVisibility] = React.useState(room.visibility);
  const [password, setPassword] = React.useState('');
  const [allowGuests, setAllowGuests] = React.useState(room.allowGuests);
  const [controlPolicy, setControlPolicy] = React.useState(room.controlPolicy);
  const [maxMembers, setMaxMembers] = React.useState(room.maxMembers);
  const [scheduled, setScheduled] = React.useState(toLocalInput(room.scheduledFor));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [rootError, setRootError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(room.name);
    setDescription(room.description ?? '');
    setVisibility(room.visibility);
    setPassword('');
    setAllowGuests(room.allowGuests);
    setControlPolicy(room.controlPolicy);
    setMaxMembers(room.maxMembers);
    setScheduled(toLocalInput(room.scheduledFor));
    setErrors({});
    setRootError(null);
  }, [open, room]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (name.trim().length < 3 || name.trim().length > 60) local.name = 'Use 3–60 characters';
    if (visibility === 'PASSWORD' && !room.requiresPassword && password.length < 4)
      local.password = 'Set a password of at least 4 characters';
    if (password && (password.length < 4 || password.length > 64))
      local.password = 'Use 4–64 characters';
    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 100)
      local.maxMembers = 'Choose 2–100';
    setErrors(local);
    if (Object.keys(local).length) return;
    update.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        visibility,
        ...(password ? { password } : {}),
        allowGuests,
        controlPolicy,
        maxMembers,
        ...(scheduled ? { scheduledFor: fromLocalInput(scheduled) } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Room settings saved');
          onOpenChange(false);
        },
        onError: (error) => {
          if (isApiError(error) && Object.keys(error.fieldErrors).length)
            setErrors(error.fieldErrors);
          else setRootError(errorMessage(error));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Room settings</DialogTitle>
          <DialogDescription>Changes apply to everyone in the room right away.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="grid gap-5">
          <FormError message={rootError} />
          <FormField label="Room name" htmlFor="settings-name" error={errors.name}>
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Description" htmlFor="settings-description" error={errors.description}>
            <Textarea
              rows={2}
              maxLength={280}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Who can join</span>
            <VisibilityRadio
              value={visibility}
              onChange={setVisibility}
              name="settings-visibility"
            />
          </div>
          {visibility === 'PASSWORD' ? (
            <FormField
              label={room.requiresPassword ? 'New password' : 'Room password'}
              htmlFor="settings-password"
              error={errors.password}
              hint={
                room.requiresPassword
                  ? 'Leave empty to keep the current password.'
                  : '4–64 characters.'
              }
            >
              <PasswordInput
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="settings-guests">Allow guests</Label>
            <Switch id="settings-guests" checked={allowGuests} onCheckedChange={setAllowGuests} />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Who controls playback</span>
            <ControlPolicyRadio value={controlPolicy} onChange={setControlPolicy} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Maximum members" htmlFor="settings-max" error={errors.maxMembers}>
              <Input
                type="number"
                min={2}
                max={100}
                value={maxMembers}
                onChange={(e) => setMaxMembers(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Starts at" htmlFor="settings-scheduled" error={errors.scheduledFor}>
              <Input
                type="datetime-local"
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending} loadingText="Saving">
              Save settings
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/**
 * Swap the title playing in the room for everyone (MOVIE_CHANGE). Retries once on a stale
 * version; resolves true when the server accepted the change.
 */
export function useChangeRoomMovie(
  roomId: string,
  socket: Socket | null,
  engine: RoomSyncEngine | null,
) {
  const [busy, setBusy] = React.useState(false);
  const change = React.useCallback(
    async (movieId: string, successMessage = 'Title changed for everyone'): Promise<boolean> => {
      if (!socket || !engine?.current) return false;
      setBusy(true);
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const ack = (await socket.timeout(45000).emitWithAck(SocketEvents.MOVIE_CHANGE, {
            roomId,
            commandId: uuid(),
            baseVersion: engine.current.version,
            movieId,
          })) as CommandAck<PlaybackState>;
          if (ack.ok) {
            toast.success(successMessage);
            return true;
          }
          if (ack.error.code === 'STALE' && attempt === 0) continue;
          toast.error(
            ack.error.code === 'CONFLICT'
              ? 'Stop the marathon before changing the movie.'
              : ack.error.message,
          );
          return false;
        }
        return false;
      } catch {
        toast.error('Connection problem — the movie wasn’t changed.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [roomId, socket, engine],
  );
  return { change, busy };
}

export function ChangeMovieDialog({
  roomId,
  open,
  onOpenChange,
  socket,
  engine,
  currentMovieId,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  socket: Socket | null;
  engine: RoomSyncEngine | null;
  currentMovieId: string | null;
}) {
  const [movieId, setMovieId] = React.useState<string | undefined>(undefined);
  const { change, busy } = useChangeRoomMovie(roomId, socket, engine);
  React.useEffect(() => {
    if (open) setMovieId(undefined);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{currentMovieId ? 'Change the title' : 'Pick a title'}</DialogTitle>
          <DialogDescription>
            It loads paused at the start for everyone in the room.
          </DialogDescription>
        </DialogHeader>
        <MoviePicker value={movieId} onChange={setMovieId} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!movieId || movieId === currentMovieId}
            loading={busy}
            loadingText="Loading movie"
            onClick={() => movieId && void change(movieId).then((ok) => ok && onOpenChange(false))}
          >
            Play this for everyone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
