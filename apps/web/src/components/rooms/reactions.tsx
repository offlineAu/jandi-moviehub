'use client';

import { REACTION_EMOJI, SocketEvents, type CommandAck, type ReactionEmoji } from '@jandi/shared';
import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { FloatingBurst } from './use-room-session';

const EMOJI_NAMES: Record<ReactionEmoji, string> = {
  '🍿': 'popcorn',
  '😂': 'laughing',
  '😱': 'scared',
  '😍': 'love it',
  '👏': 'applause',
  '🔥': 'fire',
  '😢': 'sad',
  '👀': 'eyes',
};

/** Emoji floating up over the player. Not interactive; announced politely for screen readers. */
export function ReactionOverlay({ bursts }: { bursts: FloatingBurst[] }) {
  const last = bursts[bursts.length - 1];
  return (
    <div className="pointer-events-none! absolute inset-0 overflow-hidden" aria-hidden="false">
      <AnimatePresence>
        {bursts.map((b) => (
          <motion.div
            key={b.key}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -260, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.6, ease: 'easeOut' }}
            className="absolute bottom-16 flex flex-col items-center"
            style={{ left: `${b.x}%` }}
          >
            <span
              className="text-4xl drop-shadow-[0_4px_12px_rgb(0_0_0/0.6)] sm:text-5xl"
              aria-hidden="true"
            >
              {b.emoji}
            </span>
            <span
              className="mt-0.5 max-w-24 truncate rounded-full bg-black/60 px-1.5 text-[10px] font-medium text-white/90"
              aria-hidden="true"
            >
              {b.displayName}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
      <p className="sr-only" aria-live="polite">
        {last ? `${last.displayName} reacted ${EMOJI_NAMES[last.emoji] ?? last.emoji}` : ''}
      </p>
    </div>
  );
}

export function ReactionBar({
  roomId,
  socket,
  className,
}: {
  roomId: string;
  socket: Socket | null;
  className?: string;
}) {
  const [cooling, setCooling] = React.useState(false);
  const send = async (emoji: ReactionEmoji) => {
    if (!socket || cooling) return;
    try {
      const ack = (await socket
        .timeout(4000)
        .emitWithAck(SocketEvents.REACTION_BURST, { roomId, emoji })) as CommandAck<unknown>;
      if (!ack.ok) {
        if (ack.error.code === 'RATE_LIMITED') {
          setCooling(true);
          window.setTimeout(() => setCooling(false), 3000);
          toast('Easy there — reactions are cooling down');
        } else toast.error(ack.error.message);
      }
    } catch {
      toast.error('Reaction not sent — check your connection.');
    }
  };
  return (
    <div
      role="group"
      aria-label="Send a reaction"
      className={cn('flex items-center justify-between sm:justify-start sm:gap-1', className)}
    >
      {REACTION_EMOJI.map((emoji) => (
        <Tooltip key={emoji} label={`React: ${EMOJI_NAMES[emoji]}`}>
          <button
            type="button"
            onClick={() => void send(emoji)}
            disabled={cooling}
            aria-label={`React with ${EMOJI_NAMES[emoji]}`}
            className="grid size-9 shrink-0 place-items-center rounded-full text-xl transition-transform hover:scale-110 hover:bg-glass-2 focus-ring active:scale-95 disabled:opacity-40 min-[360px]:size-10 sm:size-9"
          >
            {emoji}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
