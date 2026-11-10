'use client';
import { useSearchParams } from 'next/navigation';
import { externalMediaSchema } from '@jandi/shared';
import { VidsrcRoomPlayer } from '@/components/rooms/vidsrc-room-player';
import { useRoomSourceCapabilities } from '@/lib/queries/room-sources';

export function EmbedWatch() {
  const params = useSearchParams();
  const capabilities = useRoomSourceCapabilities();
  let input: unknown;
  try {
    input = JSON.parse(params.get('media') ?? 'null');
  } catch {
    input = null;
  }
  const parsed = externalMediaSchema.safeParse(input);
  if (!parsed.success || parsed.data.provider !== 'vidsrc')
    return <p className="p-6">Invalid player selection.</p>;
  if (capabilities.isPending) return <p className="p-6">Checking player availability…</p>;
  if (!capabilities.data?.vidsrcSync) return <p className="p-6">This player is not enabled.</p>;
  const media = parsed.data;
  const path =
    media.type === 'movie'
      ? `movie/${media.tmdbId}`
      : `tv/${media.tvId}/${media.season}/${media.episode}`;
  return (
    <VidsrcRoomPlayer
      src={`https://vidsrc.sh/embed/${path}?autoplay=0&autonext=0`}
      title="Selected title"
      media={media}
    />
  );
}
