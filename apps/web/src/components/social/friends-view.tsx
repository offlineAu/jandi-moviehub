'use client';

import {
  Check,
  Clapperboard,
  Inbox,
  Lock,
  Search,
  Send,
  UserMinus,
  UserRoundSearch,
  Users,
  UserX,
  X,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { useUrlState } from '@/components/browse/use-url-state';
import { RequireAccount } from '@/components/layout/require-account';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import {
  FRIENDS_POLL_MS,
  useCancelFriendRequest,
  useFriendRequests,
  useFriends,
  useRespondToRequest,
  useUserSearch,
  type Friend,
  type FriendRequest,
} from '@/lib/queries/social';
import type { PublicUser } from '@/lib/types';
import { cn, formatRelative } from '@/lib/utils';
import { FriendButton, RemoveFriendDialog } from './friend-button';
import { describePresence, FRIENDSHIP_STATUS_TEXT, type PresenceKind } from './social-utils';

const TABS = ['friends', 'requests', 'find'] as const;
type Tab = (typeof TABS)[number];

const DOT: Record<PresenceKind, string> = {
  watching: 'bg-accent',
  'private-room': 'bg-primary',
  online: 'bg-success',
  offline: 'bg-subtle/60',
};

function PersonAvatar({ user, presence }: { user: PublicUser; presence?: PresenceKind }) {
  return (
    <span className="relative shrink-0">
      <Avatar src={user.avatarUrl} name={user.displayName} size="md" />
      {presence ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-[3px] ring-surface',
            DOT[presence],
          )}
        />
      ) : null}
    </span>
  );
}

function PersonName({ user }: { user: PublicUser }) {
  return (
    <p className="truncate">
      <Link
        href={`/profile/${user.username}`}
        className="rounded font-medium hover:underline focus-ring"
      >
        {user.displayName}
      </Link>{' '}
      <span className="text-sm text-muted">@{user.username}</span>
    </p>
  );
}

function RowsSkeleton({ count = 4, label }: { count?: number; label: string }) {
  return (
    <ul className="grid gap-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
        >
          <Skeleton className="size-10 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Friends ----------
function FriendRow({ friend }: { friend: Friend }) {
  const presence = describePresence(friend);
  const [confirm, setConfirm] = React.useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-nowrap">
      <PersonAvatar user={friend.user} presence={presence.kind} />
      <div className="min-w-0 flex-1">
        <PersonName user={friend.user} />
        <p
          className={cn(
            'mt-0.5 flex min-w-0 items-center gap-1.5 text-sm',
            presence.kind === 'watching' ? 'text-foreground/90' : 'text-muted',
          )}
        >
          {presence.kind === 'watching' ? (
            <Clapperboard className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
          ) : presence.kind === 'private-room' ? (
            <Lock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          ) : null}
          <span className="truncate">{presence.text}</span>
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {presence.joinHref ? (
          <Button asChild size="sm">
            <Link href={presence.joinHref} aria-label={`Join ${friend.user.displayName}’s room`}>
              Join
            </Link>
          </Button>
        ) : null}
        <Tooltip label="Remove friend">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${friend.user.displayName} from friends`}
            onClick={() => setConfirm(true)}
          >
            <UserMinus aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
      <RemoveFriendDialog user={friend.user} open={confirm} onOpenChange={setConfirm} />
    </li>
  );
}

function FriendsPanel({ onFind }: { onFind: () => void }) {
  const query = useFriends({ poll: true });
  if (query.isLoading) return <RowsSkeleton label="Loading friends" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Your friends didn’t load"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const items = query.data?.items ?? [];
  if (!items.length) {
    return (
      <EmptyState
        icon={Users}
        title="No friends yet"
        description="Add friends to see when they’re online, jump into their watch parties and build playlists together."
        action={
          <Button onClick={onFind}>
            <UserRoundSearch aria-hidden="true" />
            Find people
          </Button>
        }
      />
    );
  }
  const onlineCount = items.filter((f) => f.online || f.watching).length;
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        {items.length} {items.length === 1 ? 'friend' : 'friends'} · {onlineCount} online
        <span className="sr-only">
          . Presence refreshes every {FRIENDS_POLL_MS / 1000} seconds.
        </span>
      </p>
      <ul className="grid gap-2" aria-label="Friends">
        {items.map((friend) => (
          <FriendRow key={friend.user.id} friend={friend} />
        ))}
      </ul>
    </>
  );
}

// ---------- Requests ----------
function IncomingRow({ request }: { request: FriendRequest }) {
  const respond = useRespondToRequest();
  const pending = respond.isPending ? respond.variables?.action : undefined;
  const act = (action: 'accept' | 'decline') =>
    respond.mutate(
      { id: request.id, action },
      {
        onSuccess: () =>
          toast.success(
            action === 'accept'
              ? `You and ${request.user.displayName} are now friends`
              : 'Friend request declined',
          ),
        onError: (error) => toast.error(errorMessage(error, 'Couldn’t respond to the request.')),
      },
    );
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-nowrap">
      <PersonAvatar user={request.user} />
      <div className="min-w-0 flex-1">
        <PersonName user={request.user} />
        <p className="mt-0.5 text-sm text-muted">Sent {formatRelative(request.createdAt)}</p>
      </div>
      <div className="ml-auto flex gap-2">
        <Button
          size="sm"
          loading={pending === 'accept'}
          loadingText="Accepting"
          disabled={respond.isPending}
          aria-label={`Accept friend request from ${request.user.displayName}`}
          onClick={() => act('accept')}
        >
          <Check aria-hidden="true" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={pending === 'decline'}
          loadingText="Declining"
          disabled={respond.isPending}
          aria-label={`Decline friend request from ${request.user.displayName}`}
          onClick={() => act('decline')}
        >
          <UserX aria-hidden="true" />
          Decline
        </Button>
      </div>
    </li>
  );
}

function OutgoingRow({ request }: { request: FriendRequest }) {
  const cancel = useCancelFriendRequest();
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-nowrap">
      <PersonAvatar user={request.user} />
      <div className="min-w-0 flex-1">
        <PersonName user={request.user} />
        <p className="mt-0.5 text-sm text-muted">Sent {formatRelative(request.createdAt)}</p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="ml-auto"
        loading={cancel.isPending}
        loadingText="Cancelling"
        aria-label={`Cancel friend request to ${request.user.displayName}`}
        onClick={() =>
          cancel.mutate(request.id, {
            onSuccess: () => toast.success('Friend request cancelled'),
            onError: (error) => toast.error(errorMessage(error, 'Couldn’t cancel the request.')),
          })
        }
      >
        <X aria-hidden="true" />
        Cancel
      </Button>
    </li>
  );
}

function RequestsPanel({ onFind }: { onFind: () => void }) {
  const query = useFriendRequests();
  if (query.isLoading) return <RowsSkeleton count={3} label="Loading friend requests" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Friend requests didn’t load"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const { incoming = [], outgoing = [] } = query.data ?? {};
  if (!incoming.length && !outgoing.length) {
    return (
      <EmptyState
        icon={Inbox}
        title="No pending requests"
        description="Requests you send and receive show up here until they’re answered."
        action={
          <Button variant="secondary" onClick={onFind}>
            <UserRoundSearch aria-hidden="true" />
            Find people
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid gap-8">
      <section aria-labelledby="incoming-requests">
        <h2
          id="incoming-requests"
          className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"
        >
          <Inbox className="size-4 text-primary" aria-hidden="true" />
          Received
          <span className="text-sm font-normal text-muted">({incoming.length})</span>
        </h2>
        {incoming.length ? (
          <ul className="grid gap-2">
            {incoming.map((r) => (
              <IncomingRow key={r.id} request={r} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No requests waiting for you.</p>
        )}
      </section>
      <section aria-labelledby="outgoing-requests">
        <h2
          id="outgoing-requests"
          className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"
        >
          <Send className="size-4 text-primary" aria-hidden="true" />
          Sent
          <span className="text-sm font-normal text-muted">({outgoing.length})</span>
        </h2>
        {outgoing.length ? (
          <ul className="grid gap-2">
            {outgoing.map((r) => (
              <OutgoingRow key={r.id} request={r} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You haven’t sent any requests.</p>
        )}
      </section>
    </div>
  );
}

// ---------- Find people ----------
function FindPanel() {
  const [text, setText] = React.useState('');
  const [term, setTerm] = React.useState('');
  React.useEffect(() => {
    const t = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(t);
  }, [text]);
  const query = useUserSearch(term);
  const tooShort = term.length < 2;

  let body: React.ReactNode;
  if (tooShort) {
    body = (
      <EmptyState
        icon={Search}
        title="Find people by name"
        description="Type at least 2 characters of a username or display name. People who turned off discoverability won’t appear."
      />
    );
  } else if (query.isLoading) {
    body = <RowsSkeleton count={3} label="Searching people" />;
  } else if (query.isError) {
    body = (
      <ErrorState
        title="Search didn’t work"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  } else if (!query.data?.items.length) {
    body = (
      <EmptyState
        icon={UserRoundSearch}
        title="No one found"
        description={`No discoverable people match “${term}”.`}
      />
    );
  } else {
    body = (
      <ul className="grid gap-2" aria-label="People" aria-busy={query.isFetching || undefined}>
        {query.data.items.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-nowrap"
          >
            <PersonAvatar user={u} />
            <div className="min-w-0 flex-1">
              <PersonName user={u} />
              {FRIENDSHIP_STATUS_TEXT[u.friendship] ? (
                <Badge
                  variant={u.friendship === 'friends' ? 'playable' : 'primary'}
                  className="mt-1"
                >
                  {FRIENDSHIP_STATUS_TEXT[u.friendship]}
                </Badge>
              ) : null}
            </div>
            <div className="ml-auto">
              <FriendButton user={u} friendship={u.friendship} size="sm" compact />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="grid gap-5">
      <form
        role="search"
        className="max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(text.trim());
        }}
      >
        <SearchInput
          value={text}
          onValueChange={setText}
          label="Search people by username or name"
          placeholder="Search by username or name"
          maxLength={40}
          className="[&_input]:h-11"
        />
      </form>
      <div aria-live="polite" className="sr-only">
        {!tooShort && query.data
          ? `${query.data.items.length} ${query.data.items.length === 1 ? 'person' : 'people'} found`
          : ''}
      </div>
      {body}
    </div>
  );
}

export function FriendsView() {
  const { params, set } = useUrlState();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'friends';
  const setTab = (v: string) => set({ tab: v === 'friends' ? null : v });

  return (
    <RequireAccount feature="Friends">
      {() => <FriendsLayout tab={tab} setTab={setTab} />}
    </RequireAccount>
  );
}

function FriendsLayout({ tab, setTab }: { tab: Tab; setTab: (v: string) => void }) {
  const requests = useFriendRequests();
  const incoming = requests.data?.incoming.length ?? 0;
  return (
    <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Friends</h1>
      <p className="mt-1 text-sm text-muted">See who’s around, answer requests, and find people.</p>
      <Tabs value={tab} onValueChange={setTab} className="mt-6 max-w-4xl">
        <TabsList aria-label="Friends sections">
          <TabsTrigger value="friends">
            <Users aria-hidden="true" />
            Friends
          </TabsTrigger>
          <TabsTrigger value="requests">
            <Inbox aria-hidden="true" />
            Requests
            {incoming ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                {incoming}
                <span className="sr-only"> pending</span>
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="find">
            <UserRoundSearch aria-hidden="true" />
            Find people
          </TabsTrigger>
        </TabsList>
        <TabsContent value="friends">
          <FriendsPanel onFind={() => setTab('find')} />
        </TabsContent>
        <TabsContent value="requests">
          <RequestsPanel onFind={() => setTab('find')} />
        </TabsContent>
        <TabsContent value="find">
          <FindPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
