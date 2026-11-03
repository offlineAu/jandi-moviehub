'use client';

import { Check, UserCheck, UserMinus, UserPlus, UserX, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';
import {
  useCancelFriendRequest,
  useFriendRequests,
  useRemoveFriend,
  useRespondToRequest,
  useSendFriendRequest,
} from '@/lib/queries/social';
import type { Friendship, PublicUser } from '@/lib/types';
import { findRequestId } from './social-utils';

/** Confirmed unfriend, shared by the friends list and profiles. */
export function RemoveFriendDialog({
  user,
  open,
  onOpenChange,
  onRemoved,
}: {
  user: PublicUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) {
  const remove = useRemoveFriend();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove ${user.displayName} as a friend?`}
      description="You’ll stop seeing each other’s presence and friends-only rooms. You can send a new request later."
      confirmLabel="Remove friend"
      pendingLabel="Removing"
      pending={remove.isPending}
      onConfirm={() =>
        remove.mutate(user.id, {
          onSuccess: () => {
            toast.success(`${user.displayName} was removed from your friends`);
            onOpenChange(false);
            onRemoved?.();
          },
          onError: (error) => toast.error(errorMessage(error, 'Couldn’t remove the friend.')),
        })
      }
    />
  );
}

/**
 * Add / Cancel / Accept+Decline / Remove for a friendship status. Request ids are resolved from
 * `/friends/requests` because profiles and search results only carry the status.
 */
export function FriendButton({
  user,
  friendship,
  size = 'md',
  compact,
}: {
  user: PublicUser;
  friendship: Friendship;
  size?: ButtonProps['size'];
  /** Shorter labels for dense lists. */
  compact?: boolean;
}) {
  const me = useMe();
  const hasAccount = !!me.data && !me.data.isGuest;
  const needsRequests = hasAccount && (friendship === 'incoming' || friendship === 'outgoing');
  const requests = useFriendRequests(needsRequests);
  const send = useSendFriendRequest();
  const respond = useRespondToRequest();
  const cancel = useCancelFriendRequest();
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  const requestId = (direction: 'incoming' | 'outgoing') => {
    const id = findRequestId(requests.data, user.id, direction);
    if (!id) {
      void requests.refetch();
      toast.error('That request changed. Refreshing — try again in a moment.');
    }
    return id;
  };

  // Visitors and guests can't have friends; the API would reject every action.
  if (friendship === 'self' || !hasAccount || me.data?.id === user.id) return null;

  if (friendship === 'none') {
    return (
      <Button
        size={size}
        loading={send.isPending}
        loadingText="Sending"
        aria-label={`Add ${user.displayName} as a friend`}
        onClick={() =>
          send.mutate(user.username, {
            onSuccess: ({ status }) =>
              toast.success(
                status === 'ACCEPTED'
                  ? `You and ${user.displayName} are now friends`
                  : `Friend request sent to ${user.displayName}`,
              ),
            onError: (error) => toast.error(errorMessage(error, 'Couldn’t send the request.')),
          })
        }
      >
        <UserPlus aria-hidden="true" />
        Add friend
      </Button>
    );
  }

  if (friendship === 'outgoing') {
    return (
      <Button
        size={size}
        variant="secondary"
        loading={cancel.isPending}
        loadingText="Cancelling"
        disabled={requests.isLoading}
        aria-label={`Cancel friend request to ${user.displayName}`}
        onClick={() => {
          const id = requestId('outgoing');
          if (!id) return;
          cancel.mutate(id, {
            onSuccess: () => toast.success('Friend request cancelled'),
            onError: (error) => toast.error(errorMessage(error, 'Couldn’t cancel the request.')),
          });
        }}
      >
        <X aria-hidden="true" />
        {compact ? 'Cancel' : 'Cancel request'}
      </Button>
    );
  }

  if (friendship === 'incoming') {
    const pendingAction = respond.isPending ? respond.variables?.action : undefined;
    const act = (action: 'accept' | 'decline') => {
      const id = requestId('incoming');
      if (!id) return;
      respond.mutate(
        { id, action },
        {
          onSuccess: () =>
            toast.success(
              action === 'accept'
                ? `You and ${user.displayName} are now friends`
                : 'Friend request declined',
            ),
          onError: (error) => toast.error(errorMessage(error, 'Couldn’t respond to the request.')),
        },
      );
    };
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size={size}
          loading={pendingAction === 'accept'}
          loadingText="Accepting"
          disabled={requests.isLoading || respond.isPending}
          aria-label={`Accept friend request from ${user.displayName}`}
          onClick={() => act('accept')}
        >
          <Check aria-hidden="true" />
          Accept
        </Button>
        <Button
          size={size}
          variant="secondary"
          loading={pendingAction === 'decline'}
          loadingText="Declining"
          disabled={requests.isLoading || respond.isPending}
          aria-label={`Decline friend request from ${user.displayName}`}
          onClick={() => act('decline')}
        >
          <UserX aria-hidden="true" />
          Decline
        </Button>
      </div>
    );
  }

  // friends
  return (
    <>
      {compact ? (
        <span className="inline-flex h-8 items-center gap-1.5 px-2 text-sm text-muted">
          <UserCheck className="size-4 text-success" aria-hidden="true" />
          Friends
        </span>
      ) : (
        <Button
          size={size}
          variant="secondary"
          aria-label={`Remove ${user.displayName} from friends`}
          onClick={() => setConfirmRemove(true)}
        >
          <UserMinus aria-hidden="true" />
          Remove friend
        </Button>
      )}
      <RemoveFriendDialog user={user} open={confirmRemove} onOpenChange={setConfirmRemove} />
    </>
  );
}
