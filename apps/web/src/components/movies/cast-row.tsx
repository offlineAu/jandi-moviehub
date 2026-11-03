import { UserRound } from 'lucide-react';
import { ScrollRail } from '@/components/ui/scroll-rail';
import type { CastMember } from '@/lib/types';
import { Artwork } from './artwork';

export function CastRow({ cast }: { cast: CastMember[] }) {
  if (!cast.length) return null;
  return (
    <ScrollRail title="Cast" itemCount={cast.length}>
      <ul className="flex gap-4">
        {cast.slice(0, 24).map((member, i) => (
          <li key={`${member.name}-${i}`} className="w-28 shrink-0 snap-start sm:w-32">
            <div className="relative aspect-square overflow-hidden rounded-full bg-surface ring-1 ring-white/10">
              {member.profileUrl ? (
                <Artwork src={member.profileUrl} alt="" sizes="128px" kind="profile" />
              ) : (
                <div className="grid size-full place-items-center text-subtle">
                  <UserRound className="size-8" aria-hidden="true" />
                </div>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-center text-sm font-medium leading-snug">
              {member.name}
            </p>
            {member.character ? (
              <p className="line-clamp-2 text-center text-xs text-muted">{member.character}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </ScrollRail>
  );
}
