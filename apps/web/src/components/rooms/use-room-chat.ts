'use client';

import {
  SocketEvents,
  type ChatMessageDto,
  type CommandAck,
  type ReactionEmoji,
} from '@jandi/shared';
import * as React from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { apiFetch, errorMessage } from '@/lib/api';

export type ChatItem = ChatMessageDto & { pending?: boolean; failed?: boolean };

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function chatErrorText(code: string, message: string): string {
  if (code === 'RATE_LIMITED') return 'You’re sending messages too fast. Wait a few seconds.';
  if (message === 'SPAM_DETECTED' || /spam/i.test(message))
    return 'That message was blocked as a repeat. Try saying something new.';
  return message || 'Message not sent';
}

/**
 * Room chat: history over REST (older pages on demand), live messages over the socket,
 * optimistic sends reconciled by `clientId`, reactions and deletions.
 */
export function useRoomChat(
  roomId: string,
  socket: Socket | null,
  myUserId: string | null,
  me: { displayName: string; avatarUrl: string | null; isGuest: boolean } | null,
) {
  const [messages, setMessages] = React.useState<ChatItem[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [incoming, setIncoming] = React.useState(0);
  const myIdRef = React.useRef(myUserId);
  React.useEffect(() => {
    myIdRef.current = myUserId;
  }, [myUserId]);

  const loadInitial = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: ChatMessageDto[]; hasMore: boolean }>(
        `/rooms/${encodeURIComponent(roomId)}/messages`,
        {
          query: { limit: 50 },
        },
      );
      setMessages((current) => {
        // Keep anything that arrived live while history was loading.
        const ids = new Set(res.items.map((m) => m.id));
        return [...res.items, ...current.filter((m) => !ids.has(m.id))];
      });
      setHasMore(res.hasMore);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  React.useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadOlder = React.useCallback(async () => {
    if (loadingOlder || !hasMore) return;
    const oldest = messages.find((m) => !m.pending);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await apiFetch<{ items: ChatMessageDto[]; hasMore: boolean }>(
        `/rooms/${encodeURIComponent(roomId)}/messages`,
        {
          query: { before: oldest.createdAt, limit: 50 },
        },
      );
      setMessages((current) => {
        const ids = new Set(current.map((m) => m.id));
        return [...res.items.filter((m) => !ids.has(m.id)), ...current];
      });
      setHasMore(res.hasMore);
    } catch (e) {
      toast.error(errorMessage(e, 'Older messages didn’t load.'));
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages, roomId]);

  // Live events.
  React.useEffect(() => {
    if (!socket) return;
    const onMessage = (m: ChatMessageDto) => {
      if (m.roomId !== roomId) return;
      setMessages((current) => {
        if (current.some((x) => x.id === m.id)) return current;
        const idx = m.clientId
          ? current.findIndex((x) => x.clientId === m.clientId && x.pending)
          : -1;
        if (idx >= 0) {
          const next = current.slice();
          next[idx] = m;
          return next;
        }
        return [...current, m];
      });
      if (m.kind !== 'SYSTEM' && m.author?.id !== myIdRef.current) setIncoming((n) => n + 1);
    };
    const onDeleted = (p: { roomId: string; messageId: string }) => {
      if (p.roomId !== roomId) return;
      setMessages((current) =>
        current.map((m) =>
          m.id === p.messageId ? { ...m, deleted: true, body: '', reactions: [] } : m,
        ),
      );
    };
    const onReactions = (p: {
      messageId: string;
      emoji: string;
      count: number;
      userId: string;
      added: boolean;
    }) => {
      setMessages((current) =>
        current.map((m) => {
          if (m.id !== p.messageId) return m;
          const mineChanged = p.userId === myIdRef.current;
          const existing = m.reactions.find((r) => r.emoji === p.emoji);
          let reactions = m.reactions;
          if (existing) {
            reactions = m.reactions.map((r) =>
              r.emoji === p.emoji
                ? { ...r, count: p.count, mine: mineChanged ? p.added : r.mine }
                : r,
            );
          } else {
            reactions = [
              ...m.reactions,
              { emoji: p.emoji, count: p.count, mine: mineChanged ? p.added : false },
            ];
          }
          return { ...m, reactions: reactions.filter((r) => r.count > 0) };
        }),
      );
    };
    // After a reconnect, refresh history so nothing is missed.
    let wasDown = false;
    const onDisconnect = () => {
      wasDown = true;
    };
    const onConnect = () => {
      if (wasDown) {
        wasDown = false;
        void loadInitial();
      }
    };
    socket.on(SocketEvents.CHAT_MESSAGE, onMessage);
    socket.on(SocketEvents.CHAT_DELETED, onDeleted);
    socket.on(SocketEvents.CHAT_REACTIONS, onReactions);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    return () => {
      socket.off(SocketEvents.CHAT_MESSAGE, onMessage);
      socket.off(SocketEvents.CHAT_DELETED, onDeleted);
      socket.off(SocketEvents.CHAT_REACTIONS, onReactions);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [socket, roomId, loadInitial]);

  const send = React.useCallback(
    async (body: string, replyTo?: ChatItem | null, retryOf?: ChatItem) => {
      if (!socket || !body.trim()) return false;
      const clientId = retryOf?.clientId ?? uid();
      const optimistic: ChatItem = {
        id: `pending-${clientId}`,
        roomId,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        deleted: false,
        kind: 'USER',
        author:
          me && myUserId
            ? {
                id: myUserId,
                displayName: me.displayName,
                avatarUrl: me.avatarUrl,
                isGuest: me.isGuest,
              }
            : null,
        replyTo: replyTo
          ? { id: replyTo.id, body: replyTo.body, authorName: replyTo.author?.displayName ?? null }
          : null,
        reactions: [],
        clientId,
        pending: true,
      };
      setMessages((current) =>
        retryOf
          ? current.map((m) => (m.clientId === clientId ? optimistic : m))
          : [...current, optimistic],
      );
      let ack: CommandAck<ChatMessageDto>;
      try {
        ack = (await socket.timeout(8000).emitWithAck(SocketEvents.CHAT_SEND, {
          roomId,
          body: body.trim(),
          ...(replyTo && !replyTo.pending ? { replyToId: replyTo.id } : {}),
          clientId,
        })) as CommandAck<ChatMessageDto>;
      } catch {
        ack = {
          ok: false,
          error: { code: 'INTERNAL', message: 'Connection problem — message not sent' },
        };
      }
      if (ack.ok) {
        const msg = ack.data;
        setMessages((current) => {
          const withoutDup = current.filter((m) => m.id !== msg.id || m.clientId === clientId);
          return withoutDup.map((m) => (m.clientId === clientId ? { ...msg, clientId } : m));
        });
        return true;
      }
      setMessages((current) =>
        current.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)),
      );
      toast.error(chatErrorText(ack.error.code, ack.error.message));
      return false;
    },
    [socket, roomId, me, myUserId],
  );

  const discard = React.useCallback((clientId: string) => {
    setMessages((current) => current.filter((m) => m.clientId !== clientId || !m.failed));
  }, []);

  const react = React.useCallback(
    async (messageId: string, emoji: ReactionEmoji) => {
      if (!socket) return;
      try {
        const ack = (await socket.timeout(5000).emitWithAck(SocketEvents.CHAT_REACT, {
          roomId,
          messageId,
          emoji,
        })) as CommandAck<unknown>;
        if (!ack.ok) toast.error(chatErrorText(ack.error.code, ack.error.message));
      } catch {
        toast.error('Reaction not sent — check your connection.');
      }
    },
    [socket, roomId],
  );

  const remove = React.useCallback(
    async (messageId: string) => {
      if (!socket) return;
      try {
        const ack = (await socket
          .timeout(5000)
          .emitWithAck(SocketEvents.CHAT_DELETE, { messageId })) as CommandAck<unknown>;
        if (!ack.ok) toast.error(ack.error.message || 'Couldn’t delete that message');
      } catch {
        toast.error('Couldn’t delete that message — check your connection.');
      }
    },
    [socket],
  );

  return {
    messages,
    hasMore,
    loading,
    loadingOlder,
    error,
    reload: loadInitial,
    loadOlder,
    send,
    discard,
    react,
    remove,
    incoming,
    resetIncoming: () => setIncoming(0),
  };
}

export type RoomChat = ReturnType<typeof useRoomChat>;
