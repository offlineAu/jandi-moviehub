import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The "ticket stub" motif: a card with half-circle notches and a perforated tear line.
 * `stub` content sits on the right of the tear (or below it on narrow screens when `stackOnMobile`).
 */
export function TicketStub({
  children,
  stub,
  className,
  bodyClassName,
  stubClassName,
  as: Tag = 'div',
  ...props
}: {
  children: React.ReactNode;
  stub?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  stubClassName?: string;
  as?: 'div' | 'section' | 'article';
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  if (!stub) {
    return (
      <Tag
        className={cn('ticket-sides rounded-2xl border border-border-strong bg-surface', className)}
        {...props}
      >
        <div className={cn('px-7 py-6', bodyClassName)}>{children}</div>
      </Tag>
    );
  }
  return (
    <Tag
      className={cn(
        'ticket-stub flex rounded-2xl border border-border-strong bg-surface [--notch-x:calc(100%-7.5rem)]',
        className,
      )}
      {...props}
    >
      <div className={cn('min-w-0 flex-1 px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
      <div
        className={cn(
          'relative flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-1 border-l-2 border-dashed border-white/15 px-3 py-5 text-center',
          stubClassName,
        )}
      >
        {stub}
      </div>
    </Tag>
  );
}

/** Large, legible room/invite code in the ticket style. */
export function TicketCode({ code, label = 'Room code' }: { code: string; label?: string }) {
  return (
    <TicketStub stub={<span className="font-display text-xs text-muted">Admit all</span>}>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-2xl font-bold tracking-[0.18em] text-foreground">{code}</p>
    </TicketStub>
  );
}
