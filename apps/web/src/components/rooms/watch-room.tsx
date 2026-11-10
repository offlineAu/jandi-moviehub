'use client';

import { VidsrcRoomPlayer } from './vidsrc-room-player';
import { playbackAssetKey, roomTvTitle, selectionTitle } from '@jandi/shared';

import {
  ArrowLeft,
  Clapperboard,
  Film,
  MessagesSquare,
  MoreVertical,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Power,
  Settings2,
  UserPlus,
  Users,
  ListVideo,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { VideoPlayer, type PlayerIntent, type VideoPlayerHandle } from '@/components/player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/error-state';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/queries/auth';
import { useCloseRoom, useLeaveRoom, useRoomPlaybackSources, type Room } from '@/lib/queries/rooms';
import { cn, formatRuntime } from '@/lib/utils';
import { EpisodeBar } from './episode-bar';
import { Artwork } from '@/components/movies/artwork';
import { ChatPanel } from './chat-panel';
import {
  ACTIVE_MARATHON_STATES,
  MARATHON_STATE_LABEL,
  MarathonOverlay,
  MarathonPanel,
} from './marathon-panel';
import { PeoplePanel } from './people-panel';
import { ReactionBar, ReactionOverlay } from './reactions';
import { KisskhRoomPlayer } from './kisskh-room-player';
import { ChangeMovieDialog, InviteDialog, RoomSettingsDialog } from './room-dialogs';
import { SyncStatus } from './sync-status';
import { useRoomChat } from './use-room-chat';
import { useRoomSession } from './use-room-session';

type PanelTab = 'chat' | 'people' | 'marathon';

function useIsDesktop() {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

export function WatchRoom({ room }: { room: Room }) {
  const router = useRouter();
  const me = useMe();
  const session = useRoomSession(room);
  const chat = useRoomChat(room.id, session.socket, session.myUserId, me.data ?? null);
  const desktop = useIsDesktop();
  const [theater, setTheater] = React.useState(true);
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [tab, setTab] = React.useState<PanelTab>('chat');
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [movieOpen, setMovieOpen] = React.useState(false);
  const [playerFailed, setPlayerFailed] = React.useState(false);
  const [confirm, setConfirm] = React.useState<'leave' | 'close' | null>(null);
  const leave = useLeaveRoom();
  const close = useCloseRoom();

  const { playback, engine, myRole, canControl, marathon } = session;
  const individualPlayback = playback?.tvEpisode?.provider === 'kisskh';
  const isHost = myRole === 'HOST';
  const isMod = myRole === 'HOST' || myRole === 'COHOST';
  const marathonActive = !!marathon && ACTIVE_MARATHON_STATES.includes(marathon.state);
  const assetKey = playbackAssetKey(playback);
  const sources = useRoomPlaybackSources(room.id, assetKey, session.joined);
  const [sourceAttempt, setSourceAttempt] = React.useState(0);
  React.useEffect(() => setPlayerFailed(false), [assetKey]);

  // Chat unread badge: count arrivals while chat isn't visible.
  const chatVisible = tab === 'chat' && (panelOpen || !desktop);
  const [seen, setSeen] = React.useState(0);
  React.useEffect(() => {
    if (chatVisible) setSeen(chat.incoming);
  }, [chatVisible, chat.incoming]);
  const unread = Math.max(0, chat.incoming - seen);

  // Attach the sync engine to whichever <video> the player mounts.
  const playerRef = React.useCallback(
    (handle: VideoPlayerHandle | null) => {
      engine?.attachVideo(handle?.video ?? null);
    },
    [engine],
  );

  const onIntent = React.useCallback(
    (intent: PlayerIntent) => void engine?.intent(intent),
    [engine],
  );
  const onEnded = React.useCallback(() => void engine?.reportEnded(), [engine]);

  const lastDurationReport = React.useRef(0);
  const onTimeUpdate = React.useCallback(
    (_position: number, duration: number) => {
      if (
        !isHost ||
        (playback?.tvEpisode?.provider !== 'kisskh-direct' &&
          playback?.externalMedia?.provider !== 'kisskh-direct') ||
        playback.durationSec != null ||
        !assetKey ||
        !Number.isFinite(duration) ||
        duration < 1 ||
        duration > 86400 ||
        Date.now() - lastDurationReport.current < 5000
      )
        return;
      lastDurationReport.current = Date.now();
      void engine?.intent({ type: 'duration', durationSec: duration });
    },
    [isHost, playback, assetKey, engine],
  );

  const sourcesMovie = sources.data?.movie;
  const nowTitle = sourcesMovie?.title ?? (assetKey ? room.movie?.title : null) ?? null;

  const overlay = (
    <>
      <ReactionOverlay bursts={session.bursts} />
      <MarathonOverlay marathon={marathon} serverNow={session.serverNow} />
      {session.needsInteraction ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => void engine?.resumeLocal()}
            className="inline-flex items-center gap-3 rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-[0_10px_40px_-6px_rgb(219_39_119/0.7)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <Play className="size-5 fill-current" aria-hidden="true" />
            Click to join playback
          </button>
        </div>
      ) : null}
    </>
  );

  let stage: React.ReactNode;
  if (!session.joined && session.joinError) {
    stage = (
      <ErrorState
        className="aspect-video rounded-none border-0"
        title="Couldn’t connect to the room"
        error={new Error(session.joinError)}
        onRetry={session.rejoin}
      />
    );
  } else if (!session.joined) {
    stage = (
      <div className="grid aspect-video place-items-center bg-black text-muted">
        <span className="flex items-center gap-3 text-sm">
          <Spinner className="size-5" label="Joining room" />
          Joining the room…
        </span>
      </div>
    );
  } else if (!assetKey) {
    stage = (
      <div className="film-grain relative grid aspect-video place-items-center bg-[radial-gradient(70%_80%_at_50%_30%,#1d1433,#07070d)] px-6 text-center">
        <div className="grid max-w-sm justify-items-center gap-3">
          <Clapperboard className="size-10 text-primary" aria-hidden="true" />
          <p className="font-display text-xl font-semibold">
            {marathon && marathon.state === 'READY'
              ? 'The marathon is ready'
              : 'Nothing on screen yet'}
          </p>
          <p className="text-sm text-muted">
            {marathon && marathon.state === 'READY'
              ? isMod
                ? 'Start it from the Marathon panel when everyone’s here.'
                : 'The host will start it soon.'
              : canControl
                ? 'Pick something to watch together.'
                : 'The host is choosing what to watch.'}
          </p>
          {canControl && !marathonActive ? (
            <Button onClick={() => setMovieOpen(true)}>
              <Film aria-hidden="true" />
              Pick a title
            </Button>
          ) : null}
        </div>
        {overlay}
      </div>
    );
  } else if (sources.isLoading || (sources.isFetching && playerFailed)) {
    stage = (
      <div className="grid aspect-video place-items-center bg-black text-muted">
        <div className="grid justify-items-center gap-3 px-6 text-center">
          <Spinner className="size-8" label="Loading the stream" />
          {playback?.tvEpisode?.provider === 'kisskh-direct' ||
          playback?.externalMedia?.provider === 'kisskh-direct' ? (
            <p className="text-sm">Starting KissKH. This can take about a minute.</p>
          ) : null}
        </div>
      </div>
    );
  } else if (!sources.isError && sources.data?.embed?.provider === 'vidsrc') {
    stage = (
      <VidsrcRoomPlayer
        key={assetKey}
        src={sources.data.embed.url}
        title={sources.data.movie.title}
        media={sources.data.embed.media}
        engine={engine}
        canControl={canControl}
        connected={session.connected}
        episodeHref={sources.data.detailHref}
        overlay={<ReactionOverlay bursts={session.bursts} />}
      />
    );
  } else if (!sources.isError && sources.data?.embed?.provider === 'kisskh') {
    stage = (
      <KisskhRoomPlayer
        key={assetKey}
        src={sources.data.embed.url}
        title={sources.data.movie.title}
        episodeHref={sources.data.detailHref}
        overlay={<ReactionOverlay bursts={session.bursts} />}
      />
    );
  } else if (sources.isError || !sources.data?.sources.length) {
    stage = (
      <ErrorState
        className="aspect-video rounded-none border-0"
        title={sources.isError ? 'The stream didn’t load' : 'This title has no playable stream'}
        error={sources.error ?? new Error('Ask the host to pick another movie.')}
        onRetry={sources.isError ? () => void sources.refetch() : undefined}
      />
    );
  } else {
    stage = (
      <VideoPlayer
        key={`${assetKey}:${sourceAttempt}`}
        ref={playerRef}
        sources={sources.data.sources}
        title={sources.data.movie.title}
        mode="synced"
        canControl={canControl}
        onIntent={onIntent}
        onEnded={onEnded}
        onPlaybackErrorChange={setPlayerFailed}
        onSourceSwitch={(switching) => engine?.setSourceSwitching(switching)}
        onRetrySource={
          playback?.tvEpisode?.provider === 'kisskh-direct' ||
          playback?.externalMedia?.provider === 'kisskh-direct'
            ? () =>
                void sources.refetch().then((result) => {
                  if (!result.isError) {
                    setPlayerFailed(false);
                    setSourceAttempt((attempt) => attempt + 1);
                  }
                })
            : undefined
        }
        onTimeUpdate={onTimeUpdate}
        theater={theater}
        onTheaterChange={setTheater}
        overlay={overlay}
        className={cn(
          theater && desktop
            ? 'rounded-none sm:rounded-none lg:max-h-[calc(100dvh-8.5rem)]'
            : 'rounded-none sm:rounded-2xl',
        )}
      />
    );
  }

  const panelTabs = (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as PanelTab)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList aria-label="Room panels" className="mx-0 shrink-0 px-2 sm:mx-0 sm:px-2">
        <TabsTrigger value="chat">
          <MessagesSquare aria-hidden="true" />
          Chat
          {unread > 0 ? (
            <span
              className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-strong px-1 text-[11px] font-semibold text-white"
              aria-label={`${unread} unread`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="people">
          <Users aria-hidden="true" />
          People
          <span className="text-xs text-muted">
            {session.members.filter((m) => m.online).length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="marathon">
          <ListVideo aria-hidden="true" />
          Marathon
          {marathonActive ? (
            <span className="size-1.5 rounded-full bg-accent" aria-label="active" />
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="chat"
        forceMount
        className="flex min-h-0 flex-1 flex-col pt-0 data-[state=inactive]:hidden"
      >
        <ChatPanel
          chat={chat}
          myUserId={session.myUserId}
          isModerator={isMod}
          connected={session.connected}
          active={chatVisible}
        />
      </TabsContent>
      <TabsContent
        value="people"
        className="flex min-h-0 flex-1 flex-col pt-0 data-[state=inactive]:hidden"
      >
        <PeoplePanel
          roomId={room.id}
          members={session.members}
          myUserId={session.myUserId}
          myRole={myRole}
          onInvite={() => setInviteOpen(true)}
          onLeave={() => setConfirm('leave')}
        />
      </TabsContent>
      <TabsContent
        value="marathon"
        className="flex min-h-0 flex-1 flex-col pt-0 data-[state=inactive]:hidden"
      >
        <MarathonPanel
          roomId={room.id}
          marathon={marathon}
          setMarathon={session.setMarathon}
          isHost={isMod}
          socket={session.socket}
          serverNow={session.serverNow}
        />
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-[#05050b] lg:h-dvh">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 sm:gap-3 sm:px-4">
        <Tooltip label="All rooms">
          <Button asChild variant="ghost" size="icon" aria-label="Back to rooms">
            <Link href="/rooms">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-semibold leading-tight sm:text-lg">
            {room.name}
          </h1>
          <p className="flex items-center gap-2 truncate text-xs text-muted">
            <span className="font-display font-semibold tracking-[0.14em] text-foreground/80">
              {room.code}
            </span>
            {nowTitle ? (
              <span className="hidden truncate sm:inline">Now showing {nowTitle}</span>
            ) : null}
            {marathon ? (
              <Badge
                variant={marathonActive ? 'primary' : 'outline'}
                className="hidden md:inline-flex"
              >
                Marathon: {MARATHON_STATE_LABEL[marathon.state]}
              </Badge>
            ) : null}
          </p>
        </div>
        {playback?.externalMedia?.provider === 'vidsrc' ? (
          <span role="status" className="text-xs text-muted">
            {!session.connected ? 'Connection lost' : 'Shared playback · See player status'}
          </span>
        ) : individualPlayback ? (
          <span
            role="status"
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-muted"
          >
            {!session.connected
              ? 'Reconnecting'
              : !session.joined
                ? 'Joining'
                : 'Individual playback'}
          </span>
        ) : (
          <SyncStatus
            connected={session.connected}
            joined={session.joined}
            stats={session.stats}
            hasMedia={!!assetKey}
            playerFailed={playerFailed || sources.isError}
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setInviteOpen(true)}
          className="hidden sm:inline-flex"
        >
          <UserPlus aria-hidden="true" />
          Invite
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Room options">
              <MoreVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setInviteOpen(true)} className="sm:hidden">
              <UserPlus aria-hidden="true" />
              Invite people
            </DropdownMenuItem>
            {canControl && !marathonActive ? (
              <DropdownMenuItem onSelect={() => setMovieOpen(true)}>
                <Film aria-hidden="true" />
                {assetKey ? 'Change title' : 'Pick a title'}
              </DropdownMenuItem>
            ) : null}
            {isHost ? (
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2 aria-hidden="true" />
                Room settings
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setConfirm('leave')}>
              <ArrowLeft aria-hidden="true" />
              Leave room
            </DropdownMenuItem>
            {isHost ? (
              <DropdownMenuItem destructive onSelect={() => setConfirm('close')}>
                <Power aria-hidden="true" />
                Close room for everyone
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip label={panelOpen ? 'Hide side panel' : 'Show side panel'}>
          <Button
            variant="ghost"
            size="icon"
            className="relative hidden lg:inline-flex"
            aria-label={panelOpen ? 'Hide side panel' : 'Show side panel'}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((o) => !o)}
          >
            {panelOpen ? (
              <PanelRightClose aria-hidden="true" />
            ) : (
              <PanelRightOpen aria-hidden="true" />
            )}
            {!panelOpen && unread > 0 ? (
              <span
                className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent"
                aria-hidden="true"
              />
            ) : null}
          </Button>
        </Tooltip>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col outline-none lg:flex-row"
      >
        <section aria-label="Player" className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className={cn(theater && desktop ? 'bg-black' : 'sm:px-6 sm:pt-5')}>
            <div className={cn(theater && desktop ? '' : 'mx-auto max-w-5xl')}>{stage}</div>
          </div>
          <div
            className={cn(
              'flex flex-col gap-3 px-3 py-3 sm:px-6 md:flex-row md:items-center md:justify-between',
              !(theater && desktop) && 'mx-auto max-w-5xl',
            )}
          >
            <ReactionBar
              roomId={room.id}
              socket={session.socket}
              className="scrollbar-none -mx-1 overflow-x-auto px-1"
            />
            <p className="text-xs text-muted md:text-right">
              {individualPlayback
                ? 'The selected episode is shared. Playback controls are individual.'
                : canControl
                  ? 'You can control playback for the room.'
                  : `Only ${session.controlPolicy === 'HOST_ONLY' ? 'the host' : 'hosts'} can play, pause or seek. Volume and captions are yours.`}
            </p>
          </div>
          {assetKey ? (
            <div className={cn('px-3 pb-3 sm:px-6', !(theater && desktop) && 'mx-auto max-w-5xl')}>
              <EpisodeBar
                roomId={room.id}
                movieId={playback?.externalMedia ? null : (playback?.movieId ?? null)}
                status={playback?.status}
                socket={session.socket}
                engine={engine}
                canControl={canControl}
                marathonActive={marathonActive}
              />
            </div>
          ) : null}
          {sourcesMovie ? (
            <div
              className={cn(
                'hidden gap-4 px-3 pb-6 sm:px-6 md:flex',
                !(theater && desktop) && 'mx-auto max-w-5xl',
              )}
            >
              <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                <Artwork
                  src={sourcesMovie.posterUrl}
                  alt=""
                  sizes="64px"
                  fallbackTitle={sourcesMovie.title}
                />
              </div>
              <div className="min-w-0 max-w-2xl">
                <p className="text-xs text-muted">Now showing</p>
                <h2 className="font-display text-lg font-semibold">
                  <Link
                    href={sources.data?.detailHref ?? `/movies/${sourcesMovie.id}`}
                    className="rounded hover:underline focus-ring"
                  >
                    {sourcesMovie.title}
                  </Link>
                  {sourcesMovie.isDemo ? (
                    <Badge variant="demo" className="ml-2 align-middle">
                      Demo
                    </Badge>
                  ) : null}
                </h2>
                <p className="text-xs text-muted">
                  {[
                    sourcesMovie.year,
                    formatRuntime(sourcesMovie.runtimeMin),
                    sourcesMovie.genres.slice(0, 2).join(', '),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {sourcesMovie.overview ? (
                  <p className="mt-1.5 line-clamp-2 text-sm text-foreground/80">
                    {sourcesMovie.overview}
                  </p>
                ) : null}
                {sources.data?.sources[0]?.license?.attribution ? (
                  <p className="mt-1.5 text-xs text-subtle">
                    {sources.data.sources[0].license?.attribution}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
        <aside
          aria-label="Room chat and people"
          className={cn(
            'flex h-[70dvh] min-h-[420px] flex-col border-t border-border bg-background lg:h-auto lg:min-h-0 lg:w-[380px] lg:shrink-0 lg:border-l lg:border-t-0',
            !panelOpen && 'lg:hidden',
          )}
        >
          {panelTabs}
        </aside>
      </main>

      <InviteDialog
        room={room}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        canInvite={isMod || room.visibility === 'PUBLIC'}
      />
      {isHost ? (
        <RoomSettingsDialog room={room} open={settingsOpen} onOpenChange={setSettingsOpen} />
      ) : null}
      <ChangeMovieDialog
        roomId={room.id}
        open={movieOpen}
        onOpenChange={setMovieOpen}
        socket={session.socket}
        engine={engine}
        currentMovieId={
          playback?.externalMedia
            ? selectionTitle(playback.externalMedia)
            : playback?.tvEpisode
              ? roomTvTitle(playback.tvEpisode)
              : (playback?.movieId ?? null)
        }
      />
      <ConfirmDialog
        open={confirm === 'leave'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Leave this room?"
        description={
          isHost
            ? 'Hosting passes to a co-host or the longest-standing member. You can rejoin while the room is open.'
            : 'You can rejoin while the room is open.'
        }
        confirmLabel="Leave room"
        pendingLabel="Leaving"
        destructive={false}
        pending={leave.isPending}
        onConfirm={() =>
          leave.mutate(room.id, {
            onSuccess: () => {
              toast.success(`You left ${room.name}`);
              router.push('/rooms');
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Close the room for everyone?"
        description="Playback stops and everyone is sent back to Watch parties. This can’t be undone."
        confirmLabel="Close room"
        pendingLabel="Closing"
        pending={close.isPending}
        onConfirm={() =>
          close.mutate(room.id, {
            onSuccess: () => {
              toast.success('Room closed');
              router.push('/rooms');
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  );
}
