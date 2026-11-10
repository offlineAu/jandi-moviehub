'use client';

import { MessageSquare, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChatPanel } from './chat-panel';
import type { ChatItem, RoomChat } from './use-room-chat';

/** How long a message floats over the picture while the full-screen chat is closed. */
export const TICKER_MS = 7000;
const TICKER_MAX = 3;

/** Opens the chat in the full-screen player; fades with the controls unless there's unread chat. */
export function FullscreenChatToggle({ unread, onOpen }: { unread: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        unread > 0 ? `Show chat, ${unread} unread message${unread === 1 ? '' : 's'}` : 'Show chat'
      }
      className={cn(
        'absolute right-3 top-3 z-[8] grid size-11 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition-opacity duration-300 hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        unread === 0 && 'group-data-[controls=hidden]/player:opacity-0',
      )}
    >
      <MessageSquare className="size-5" aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-5"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </button>
  );
}

interface TickerItem {
  id: string;
  name: string;
  body: string;
}

/** Messages that arrived since mount, excluding system lines and the viewer's own. */
export function useTickerItems(messages: ChatItem[], myUserId: string | null) {
  const seen = React.useRef<Set<string> | null>(null);
  const timers = React.useRef<number[]>([]);
  const [items, setItems] = React.useState<TickerItem[]>([]);
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  React.useEffect(() => {
    if (!seen.current) {
      // History already on screen when the ticker appears isn't news.
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    const fresh: TickerItem[] = [];
    for (const m of messages) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (m.pending || m.kind !== 'USER' || m.deleted || m.author?.id === myUserId) continue;
      fresh.push({ id: m.id, name: m.author?.displayName ?? 'Someone', body: m.body });
    }
    if (!fresh.length) return;
    setItems((current) => [...current, ...fresh].slice(-TICKER_MAX));
    const ids = new Set(fresh.map((f) => f.id));
    timers.current.push(
      window.setTimeout(
        () => setItems((current) => current.filter((i) => !ids.has(i.id))),
        TICKER_MS,
      ),
    );
  }, [messages, myUserId]);
  return items;
}

/**
 * New messages float briefly over the picture while the full-screen chat is closed; tapping one
 * opens the chat to reply.
 */
export function FullscreenChatTicker({
  messages,
  myUserId,
  onOpen,
}: {
  messages: ChatItem[];
  myUserId: string | null;
  onOpen: () => void;
}) {
  const items = useTickerItems(messages, myUserId);
  if (!items.length) return null;
  return (
    <ul
      aria-label="New chat messages"
      className="absolute bottom-24 left-3 z-[8] grid w-[min(20rem,calc(100%-1.5rem))] gap-1.5 sm:bottom-28"
    >
      {items.map((item) => (
        <li key={item.id} className="motion-safe:animate-in motion-safe:fade-in-0">
          <button
            type="button"
            onClick={onOpen}
            className="w-full rounded-2xl bg-black/65 px-3 py-2 text-left text-sm text-white shadow-lg backdrop-blur focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="font-semibold">{item.name}</span>{' '}
            <span className="break-words text-white/90">{item.body}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The room chat inside the full-screen player: read, reply, react — same state as the panel. */
export function FullscreenChatPanel({
  chat,
  myUserId,
  isModerator,
  connected,
  onClose,
}: {
  chat: RoomChat;
  myUserId: string | null;
  isModerator: boolean;
  connected: boolean;
  onClose: () => void;
}) {
  return (
    <section aria-label="Room chat" className="flex size-full flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border pl-4 pr-1.5">
        <h2 className="font-display text-sm font-semibold">Chat</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide chat"
          className="grid size-9 place-items-center rounded-full text-muted hover:bg-white/[0.08] hover:text-foreground focus-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>
      <ChatPanel
        chat={chat}
        myUserId={myUserId}
        isModerator={isModerator}
        connected={connected}
        active
      />
    </section>
  );
}
