'use client';

import { REACTION_EMOJI, type ReactionEmoji } from '@jandi/shared';
import {
  ArrowDown,
  CornerUpLeft,
  RotateCw,
  SendHorizontal,
  SmilePlus,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import * as React from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ChatItem, RoomChat } from './use-room-chat';

const MAX_LEN = 1000;

function timeLabel(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
}

function ReactionPicker({ onPick, label }: { onPick: (e: ReactionEmoji) => void; label: string }) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip label="React">
        <DropdownMenuTrigger
          aria-label={label}
          className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/[0.08] hover:text-foreground focus-ring"
        >
          <SmilePlus className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-0 p-1">
        <div className="grid grid-cols-4 gap-0.5" role="group" aria-label="Reactions">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onPick(emoji)}
              className="grid size-9 place-items-center rounded-lg text-lg hover:bg-white/[0.08] focus-ring"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Message({
  m,
  mine,
  canDelete,
  onReply,
  onReact,
  onDelete,
  onRetry,
  onDiscard,
}: {
  m: ChatItem;
  mine: boolean;
  canDelete: boolean;
  onReply: () => void;
  onReact: (e: ReactionEmoji) => void;
  onDelete: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (m.kind === 'SYSTEM') {
    return (
      <li className="flex items-center gap-3 px-4 py-1.5 text-xs text-muted">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="max-w-[80%] text-center">{m.body}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </li>
    );
  }
  const name = m.author?.displayName ?? 'Someone';
  return (
    <li
      tabIndex={-1}
      className={cn(
        'group relative flex animate-float-up gap-3 px-4 py-1.5 outline-none transition-colors duration-200 hover:bg-white/[0.035] focus-within:bg-white/[0.035]',
        m.pending && 'opacity-60',
      )}
    >
      <Avatar src={m.author?.avatarUrl} name={name} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className={cn('truncate text-sm font-semibold', mine && 'text-[#d8b4fe]')}>
            {name}
          </span>
          <time dateTime={m.createdAt} className="shrink-0 text-[11px] text-subtle">
            {timeLabel(m.createdAt)}
          </time>
        </p>
        {m.replyTo ? (
          <p className="mt-0.5 line-clamp-1 border-l-2 border-primary/50 pl-2 text-xs text-muted">
            <span className="font-medium text-foreground/70">
              {m.replyTo.authorName ?? 'Message'}
            </span>{' '}
            {m.replyTo.body}
          </p>
        ) : null}
        {m.deleted ? (
          <p className="text-sm italic text-subtle">Message deleted</p>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">
            {m.body}
          </p>
        )}
        {m.failed ? (
          <p className="mt-1 flex items-center gap-2 text-xs text-danger">
            Not sent.
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline focus-ring rounded"
            >
              <RotateCw className="size-3" aria-hidden="true" />
              Retry
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="font-medium text-muted underline-offset-2 hover:underline focus-ring rounded"
            >
              Discard
            </button>
          </p>
        ) : null}
        {m.reactions.length && !m.deleted ? (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Reactions">
            {m.reactions.map((r) => (
              <li key={r.emoji}>
                <button
                  type="button"
                  onClick={() => onReact(r.emoji as ReactionEmoji)}
                  aria-pressed={r.mine}
                  aria-label={`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}`}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums focus-ring',
                    r.mine
                      ? 'border-primary/60 bg-primary/15 text-foreground'
                      : 'border-border-strong text-muted hover:text-foreground',
                  )}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                  {r.count}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {!m.deleted && !m.pending && !m.failed ? (
        <div className="absolute right-3 top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border-strong bg-surface-raised p-0.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Tooltip label="Reply">
            <button
              type="button"
              onClick={onReply}
              aria-label={`Reply to ${name}`}
              className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/[0.08] hover:text-foreground focus-ring"
            >
              <CornerUpLeft className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
          <ReactionPicker onPick={onReact} label={`React to ${name}’s message`} />
          {canDelete ? (
            <Tooltip label="Delete">
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete message"
                className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/[0.08] hover:text-danger focus-ring"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ChatPanel({
  chat,
  myUserId,
  isModerator,
  connected,
  active,
  className,
}: {
  chat: RoomChat;
  myUserId: string | null;
  isModerator: boolean;
  connected: boolean;
  active: boolean;
  className?: string;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [text, setText] = React.useState('');
  const [replyTo, setReplyTo] = React.useState<ChatItem | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [unseen, setUnseen] = React.useState(0);
  const prevCount = React.useRef(0);
  const restoreFrom = React.useRef<number | null>(null);

  const scrollToBottom = React.useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Keep pinned to the bottom for new messages; preserve position when older ones are prepended.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (chat.messages.length > prevCount.current) {
      const last = chat.messages[chat.messages.length - 1];
      const mineLast = last?.author?.id === myUserId;
      if (atBottom || mineLast || prevCount.current === 0) scrollToBottom();
      else setUnseen((n) => n + (chat.messages.length - prevCount.current));
    }
    prevCount.current = chat.messages.length;
  }, [chat.messages, atBottom, myUserId, scrollToBottom]);

  React.useEffect(() => {
    if (active) scrollToBottom();
  }, [active, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setAtBottom(bottom);
    if (bottom) setUnseen(0);
    if (el.scrollTop < 60 && chat.hasMore && !chat.loadingOlder) {
      restoreFrom.current = el.scrollHeight - el.scrollTop;
      void chat.loadOlder();
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || body.length > MAX_LEN) return;
    setText('');
    const reply = replyTo;
    setReplyTo(null);
    await chat.send(body, reply);
    inputRef.current?.focus();
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {!connected ? (
        <p
          className="flex items-center gap-2 border-b border-warning/20 bg-warning/[0.06] px-4 py-2 text-xs text-warning"
          role="status"
        >
          <WifiOff className="size-3.5" aria-hidden="true" />
          Reconnecting — new messages will appear when you’re back.
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto overscroll-contain py-3"
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
          aria-relevant="additions"
        >
          {chat.loading ? (
            <div className="grid gap-4 px-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="grid flex-1 gap-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : chat.error ? (
            <div className="px-4">
              <ErrorState
                compact
                title="Chat history didn’t load"
                error={chat.error}
                onRetry={() => void chat.reload()}
              />
            </div>
          ) : (
            <>
              {chat.loadingOlder ? (
                <div className="flex justify-center py-2 text-muted">
                  <Spinner className="size-4" label="Loading earlier messages" />
                </div>
              ) : chat.hasMore ? (
                <div className="flex justify-center py-2">
                  <Button variant="ghost" size="sm" onClick={() => void chat.loadOlder()}>
                    Load earlier messages
                  </Button>
                </div>
              ) : null}
              {chat.messages.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted">
                  No messages yet. Say hi — everyone in the room sees chat in real time.
                </p>
              ) : (
                <ul className="grid gap-0.5">
                  {chat.messages.map((m) => (
                    <Message
                      key={m.clientId ?? m.id}
                      m={m}
                      mine={!!myUserId && m.author?.id === myUserId}
                      canDelete={!!myUserId && (m.author?.id === myUserId || isModerator)}
                      onReply={() => {
                        setReplyTo(m);
                        inputRef.current?.focus();
                      }}
                      onReact={(e) => void chat.react(m.id, e)}
                      onDelete={() => void chat.remove(m.id)}
                      onRetry={() => void chat.send(m.body, null, m)}
                      onDiscard={() => m.clientId && chat.discard(m.clientId)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {unseen > 0 && !atBottom ? (
          <button
            type="button"
            onClick={() => {
              scrollToBottom(true);
              setUnseen(0);
            }}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-lg focus-ring"
          >
            <ArrowDown className="size-3.5" aria-hidden="true" />
            {unseen} new {unseen === 1 ? 'message' : 'messages'}
          </button>
        ) : null}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {replyTo ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs">
            <CornerUpLeft className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-muted">
              Replying to{' '}
              <span className="font-medium text-foreground">
                {replyTo.author?.displayName ?? 'message'}
              </span>
              : {replyTo.body}
            </p>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="grid size-6 place-items-center rounded text-muted hover:text-foreground focus-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message the room
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
              if (e.key === 'Escape' && replyTo) setReplyTo(null);
            }}
            placeholder="Message the room"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-[10px] border border-border-strong bg-secondary px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-subtle focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_rgb(168_85_247/0.25)] [field-sizing:content]"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!text.trim() || !connected}
          >
            <SendHorizontal aria-hidden="true" />
          </Button>
        </div>
        {text.length > MAX_LEN - 100 ? (
          <p className="mt-1 text-right text-[11px] text-muted" aria-live="polite">
            {MAX_LEN - text.length} characters left
          </p>
        ) : null}
      </form>
    </div>
  );
}
