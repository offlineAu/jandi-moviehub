'use client';

import { SplitWords } from '@/components/motion/split-text';
import { Clapperboard, Plus, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useUrlState } from '@/components/browse/use-url-state';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMe } from '@/lib/queries/auth';
import { useFriendsRooms, useMyRooms, usePublicRooms, type Room } from '@/lib/queries/rooms';
import { useRouter } from 'next/navigation';
import { Stagger, StaggerItem } from '@/components/motion/reveal';
import { RoomCard, RoomCardSkeleton } from './room-card';

const TABS = ['public', 'mine', 'friends'] as const;
type Tab = (typeof TABS)[number];

function RoomGrid({ rooms }: { rooms: Room[] }) {
  return (
    <Stagger
      as="ul"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
      stagger={0.06}
    >
      {rooms.map((room) => (
        <StaggerItem as="li" variant="pop" key={room.id}>
          <RoomCard room={room} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading rooms"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <RoomCardSkeleton key={i} />
      ))}
    </div>
  );
}

function CreateCta({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  return (
    <Button asChild variant={variant}>
      <Link href="/rooms/new">
        <Plus aria-hidden="true" />
        Start a watch party
      </Link>
    </Button>
  );
}

function PublicTab({ q, page, onPage }: { q: string; page: number; onPage: (p: number) => void }) {
  const query = usePublicRooms(q, page);
  if (query.isLoading) return <GridSkeleton />;
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        title="Rooms didn’t load"
      />
    );
  if (!query.data?.items.length) {
    return (
      <EmptyState
        icon={Clapperboard}
        title={q ? `No open rooms match “${q}”` : 'No public watch parties right now'}
        description="Start one and share the link — anyone can drop in while it’s open."
        action={<CreateCta />}
      />
    );
  }
  return (
    <>
      <RoomGrid rooms={query.data.items} />
      <Pagination
        className="mt-8"
        page={query.data.page}
        totalPages={query.data.totalPages}
        onPageChange={onPage}
      />
    </>
  );
}

function MineTab({ signedIn }: { signedIn: boolean }) {
  const query = useMyRooms(signedIn);
  if (!signedIn) {
    return (
      <EmptyState
        icon={Ticket}
        title="Log in to see your rooms"
        description="Rooms you host or have joined show up here."
        action={
          <Button asChild variant="secondary">
            <Link href="/login?next=%2Frooms%3Ftab%3Dmine">Log in</Link>
          </Button>
        }
      />
    );
  }
  if (query.isLoading) return <GridSkeleton />;
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (!query.data?.items.length) {
    return (
      <EmptyState
        icon={Ticket}
        title="You’re not in any rooms"
        description="Host a watch party or join one with a room code."
        action={<CreateCta />}
      />
    );
  }
  return <RoomGrid rooms={query.data.items} />;
}

function FriendsTab({ signedIn, isGuest }: { signedIn: boolean; isGuest: boolean }) {
  const query = useFriendsRooms(signedIn && !isGuest);
  if (!signedIn || isGuest) {
    return (
      <EmptyState
        icon={Users}
        title="Friends’ rooms need an account"
        description="Add friends and you’ll see the watch parties they’re hosting here."
        action={
          <Button asChild variant="secondary">
            <Link href={isGuest ? '/register' : '/login?next=%2Frooms%3Ftab%3Dfriends'}>
              {isGuest ? 'Create an account' : 'Log in'}
            </Link>
          </Button>
        }
      />
    );
  }
  if (query.isLoading) return <GridSkeleton />;
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (!query.data?.items.length) {
    return (
      <EmptyState
        icon={Users}
        title="None of your friends are hosting"
        description="When a friend opens a public or friends-only room, it appears here."
        action={
          <Button asChild variant="secondary">
            <Link href="/friends">Find friends</Link>
          </Button>
        }
      />
    );
  }
  return <RoomGrid rooms={query.data.items} />;
}

function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const clean = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length === 8) router.push(`/rooms/${clean}`);
      }}
    >
      <label htmlFor="room-code" className="sr-only">
        Room code
      </label>
      <Input
        id="room-code"
        value={clean}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Room code"
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-36 font-display uppercase tracking-[0.18em] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
      />
      <Button type="submit" variant="secondary" disabled={clean.length !== 8}>
        Join
      </Button>
    </form>
  );
}

export function RoomsDiscovery() {
  const me = useMe();
  const { params, set } = useUrlState();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'public';
  const q = (params.get('q') ?? '').slice(0, 60);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [text, setText] = React.useState(q);
  React.useEffect(() => setText(q), [q]);
  React.useEffect(() => {
    if (text.trim() === q) return;
    const t = window.setTimeout(() => set({ q: text.trim() || null }), 300);
    return () => window.clearTimeout(t);
  }, [text, q, set]);
  const user = me.data;

  return (
    <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-[-0.035em] sm:text-5xl">
            <SplitWords text="Watch parties" />
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Same movie, same second, everyone in the room. Drop into an open party or start your
            own.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <JoinByCode />
          {user && !user.isGuest ? <CreateCta /> : null}
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => set({ tab: v === 'public' ? null : v, page: null })}
        className="mt-6"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <TabsList aria-label="Room lists" className="md:flex-1">
            <TabsTrigger value="public">Open now</TabsTrigger>
            <TabsTrigger value="mine">My rooms</TabsTrigger>
            <TabsTrigger value="friends">Friends’ rooms</TabsTrigger>
          </TabsList>
          {tab === 'public' ? (
            <SearchInput
              value={text}
              onValueChange={setText}
              label="Search open rooms"
              placeholder="Search rooms"
              className="md:w-72"
              maxLength={60}
            />
          ) : null}
        </div>
        <TabsContent value="public">
          <PublicTab
            q={q}
            page={page}
            onPage={(p) => set({ page: p === 1 ? null : p }, { resetPage: false })}
          />
        </TabsContent>
        <TabsContent value="mine">
          <MineTab signedIn={!!user} />
        </TabsContent>
        <TabsContent value="friends">
          <FriendsTab signedIn={!!user} isGuest={!!user?.isGuest} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
