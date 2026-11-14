'use client';

import Link from 'next/link';
import { RoomCard } from '@/components/rooms/room-card';
import { ScrollRail } from '@/components/ui/scroll-rail';
import { useMyRooms } from '@/lib/queries/rooms';

/** Rooms the viewer belongs to — only rendered when there are some. */
export function YourRoomsRail() {
  const rooms = useMyRooms();
  const items = rooms.data?.items.filter((r) => r.status === 'OPEN') ?? [];
  if (!items.length) return null;
  return (
    <ScrollRail
      title="Your rooms"
      description="Jump back into a watch party."
      itemCount={items.length}
      action={
        <Link
          href="/rooms?tab=mine"
          className="mr-1 rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground focus-ring tap-row"
        >
          See all
        </Link>
      }
    >
      <ul className="flex gap-3 sm:gap-4">
        {items.map((room) => (
          <li key={room.id} className="w-[min(85vw,24rem)] shrink-0 snap-start">
            <RoomCard room={room} />
          </li>
        ))}
      </ul>
    </ScrollRail>
  );
}
