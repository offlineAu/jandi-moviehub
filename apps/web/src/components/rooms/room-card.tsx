import { CalendarClock, Globe, KeyRound, Lock, Users } from 'lucide-react';
import Link from 'next/link';
import { Spotlight } from '@/components/motion/spotlight';
import { Artwork } from '@/components/movies/artwork';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { VISIBILITY_LABEL, type Room, type RoomVisibility } from '@/lib/queries/rooms';
import { cn, formatDate } from '@/lib/utils';

const VIS_ICON: Record<RoomVisibility, typeof Globe> = {
  PUBLIC: Globe,
  PRIVATE: Lock,
  PASSWORD: KeyRound,
  FRIENDS: Users,
};

export function VisibilityBadge({ visibility }: { visibility: RoomVisibility }) {
  const Icon = VIS_ICON[visibility];
  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" />
      {VISIBILITY_LABEL[visibility]}
    </Badge>
  );
}

function scheduledLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() - 60 * 60_000) return null;
  return `${formatDate(iso)}, ${d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Room card in the ticket-stub motif: details on the left, the room code on the tear-off stub. */
export function RoomCard({
  room,
  className,
  href,
}: {
  room: Room;
  className?: string;
  href?: string;
}) {
  const scheduled = scheduledLabel(room.scheduledFor);
  const live = room.onlineCount > 0;
  return (
    <Spotlight
      as="article"
      className={cn(
        'group ticket-stub relative flex min-h-36 rounded-2xl border border-border-strong bg-surface transition-[border-color,transform,box-shadow] duration-500 ease-[var(--ease-expo)] [--notch-x:calc(100%-6.5rem)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_24px_48px_-24px_rgb(168_85_247/0.45)] focus-within:-translate-y-1',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-4 p-4">
        <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-white/10 transition-transform duration-500 ease-[var(--ease-expo)] group-hover:-rotate-3 group-hover:scale-105 sm:w-[4.5rem]">
          {room.movie ? (
            <Artwork
              src={room.movie.posterUrl}
              alt=""
              sizes="72px"
              fallbackTitle={room.movie.title}
            />
          ) : (
            <div className="grid size-full place-items-center text-subtle">
              <Users className="size-5" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {live ? (
              <Badge variant="live" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-white" aria-hidden="true" />
                {room.onlineCount} watching
              </Badge>
            ) : null}
            <VisibilityBadge visibility={room.visibility} />
          </div>
          <h3 className="mt-2 line-clamp-1 font-display text-base font-semibold">
            <Link
              href={href ?? `/rooms/${room.code}`}
              className="rounded after:absolute after:inset-0 focus-ring"
            >
              {room.name}
            </Link>
          </h3>
          <p className="mt-0.5 line-clamp-1 text-sm text-muted">
            {room.movie ? room.movie.title : 'No movie picked yet'}
          </p>
          <div className="mt-2.5 flex items-center gap-2 text-xs text-muted">
            <Avatar src={room.host.avatarUrl} name={room.host.displayName} size="xs" />
            <span className="truncate">Hosted by {room.host.displayName}</span>
          </div>
          {scheduled ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-foreground/80">
              <CalendarClock className="size-3.5 text-primary" aria-hidden="true" />
              {scheduled}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex w-[6.5rem] shrink-0 flex-col items-center justify-center gap-1 border-l-2 border-dashed border-white/12 px-2 text-center">
        <span className="text-[11px] text-muted">Room</span>
        <span className="font-display text-[13px] font-bold tracking-[0.14em] text-foreground transition-colors duration-300 group-hover:text-primary">
          {room.code}
        </span>
        <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">
          <Users className="size-3" aria-hidden="true" />
          {room.memberCount}/{room.maxMembers}
        </span>
      </div>
    </Spotlight>
  );
}

export function RoomCardSkeleton() {
  return (
    <div
      className="ticket-stub shimmer h-36 rounded-2xl [--notch-x:calc(100%-6.5rem)]"
      aria-hidden="true"
    />
  );
}
