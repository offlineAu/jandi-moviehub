'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { collaboratorSchema } from '@jandi/shared';
import { Crown, LogOut, UserMinus, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage, isApiError } from '@/lib/api';
import { useAddCollaborator, useRemoveCollaborator, type Playlist } from '@/lib/queries/playlists';
import { useFriends } from '@/lib/queries/social';
import type { Me, PublicUser } from '@/lib/types';

type FormInput = z.input<typeof collaboratorSchema>;
type FormOutput = z.output<typeof collaboratorSchema>;

function PersonRow({ user, children }: { user: PublicUser; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.displayName}</p>
        <p className="truncate text-xs text-muted">@{user.username}</p>
      </div>
      {children}
    </li>
  );
}

function AddCollaboratorForm({ playlist }: { playlist: Playlist }) {
  const add = useAddCollaborator(playlist.id);
  const friends = useFriends();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: { username: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const taken = new Set([playlist.owner.id, ...playlist.collaborators.map((c) => c.id)]);
  const suggestions = (friends.data?.items ?? []).filter((f) => !taken.has(f.user.id)).slice(0, 6);

  const addUser = async (username: string) => {
    try {
      const updated = await add.mutateAsync(username);
      const added = updated.collaborators.find((c) => c.username === username);
      toast.success(`${added?.displayName ?? `@${username}`} can now edit this playlist`);
      form.reset({ username: '' });
    } catch (error) {
      const message =
        isApiError(error) && error.status === 404
          ? `No account goes by @${username}.`
          : errorMessage(error, 'Couldn’t add the collaborator. Try again.');
      form.setError('username', { type: 'server', message });
    }
  };

  return (
    <div className="grid gap-3">
      <form
        noValidate
        className="flex items-start gap-2"
        onSubmit={form.handleSubmit((v) => addUser(v.username))}
      >
        <FormField
          label="Add by username"
          htmlFor="collaborator-username"
          error={errors.username?.message}
          className="flex-1"
        >
          <Input
            placeholder="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            {...form.register('username')}
          />
        </FormField>
        <Button
          type="submit"
          className="mt-7 h-11"
          loading={isSubmitting}
          loadingText="Adding"
          aria-label="Add collaborator"
        >
          <UserPlus aria-hidden="true" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </form>
      <FormError message={errors.root?.server?.message} />
      {suggestions.length ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Your friends</p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((f) => (
              <li key={f.user.id}>
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={() => void addUser(f.user.username)}
                  aria-label={`Add ${f.user.displayName} as a collaborator`}
                  className="inline-flex h-8 items-center gap-2 rounded-full border border-border-strong pl-1 pr-3 text-xs font-medium transition-colors hover:border-primary/60 hover:bg-primary/[0.08] focus-ring disabled:opacity-50"
                >
                  <Avatar src={f.user.avatarUrl} name={f.user.displayName} size="xs" />
                  {f.user.displayName}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function CollaboratorsDialog({
  playlist,
  me,
  open,
  onOpenChange,
}: {
  playlist: Playlist;
  me: Me | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const remove = useRemoveCollaborator(playlist.id);
  const [confirm, setConfirm] = React.useState<PublicUser | null>(null);
  const isOwner = playlist.isOwner;
  const leaving = !!confirm && confirm.id === me?.id;

  const onConfirm = () => {
    if (!confirm) return;
    const target = confirm;
    remove.mutate(target.id, {
      onSuccess: () => {
        setConfirm(null);
        if (target.id === me?.id) {
          toast.success(`You left “${playlist.name}”`);
          onOpenChange(false);
          router.push('/playlists');
        } else {
          toast.success(`${target.displayName} was removed`);
        }
      },
      onError: (error) => toast.error(errorMessage(error, 'Couldn’t update collaborators.')),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collaborators</DialogTitle>
            <DialogDescription>
              {isOwner
                ? 'Collaborators can add, remove and reorder movies. Only you can edit details or delete the playlist.'
                : 'People who can add, remove and reorder movies in this playlist.'}
            </DialogDescription>
          </DialogHeader>
          {isOwner && !playlist.collaborative && playlist.collaborators.length ? (
            <p className="rounded-[10px] border border-warning/30 bg-warning/[0.08] px-3.5 py-2.5 text-sm text-[#fde68a]">
              Collaboration is turned off, so collaborators can’t open or edit this playlist right
              now. Turn it back on in Edit details, or add someone to re-enable it.
            </p>
          ) : null}
          {isOwner ? <AddCollaboratorForm playlist={playlist} /> : null}
          <ul className="divide-y divide-border" aria-label="People on this playlist">
            <PersonRow user={playlist.owner}>
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Crown className="size-3.5 text-warning" aria-hidden="true" />
                Owner
              </span>
            </PersonRow>
            {playlist.collaborators.map((c) => (
              <PersonRow key={c.id} user={c}>
                {isOwner ? (
                  <Tooltip label="Remove collaborator">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${c.displayName}`}
                      onClick={() => setConfirm(c)}
                    >
                      <UserMinus aria-hidden="true" />
                    </Button>
                  </Tooltip>
                ) : c.id === me?.id ? (
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(c)}>
                    <LogOut aria-hidden="true" />
                    Leave
                  </Button>
                ) : (
                  <Link
                    href={`/profile/${c.username}`}
                    className="rounded text-xs text-muted hover:text-foreground focus-ring"
                  >
                    Profile
                  </Link>
                )}
              </PersonRow>
            ))}
          </ul>
          {!playlist.collaborators.length ? (
            <p className="-mt-2 text-sm text-muted">
              {isOwner
                ? 'No collaborators yet. Add a friend to build this lineup together.'
                : 'No collaborators.'}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={leaving ? `Leave “${playlist.name}”?` : `Remove ${confirm?.displayName ?? ''}?`}
        description={
          leaving
            ? 'You won’t be able to edit it anymore, and it disappears from your playlists unless it’s public.'
            : 'They won’t be able to edit this playlist anymore. Movies they added stay.'
        }
        confirmLabel={leaving ? 'Leave playlist' : 'Remove'}
        pendingLabel={leaving ? 'Leaving' : 'Removing'}
        pending={remove.isPending}
        onConfirm={onConfirm}
      />
    </>
  );
}
