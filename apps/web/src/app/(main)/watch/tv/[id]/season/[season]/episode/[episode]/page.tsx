import { TvEpisodeWatch } from '@/components/series/tv-episode-watch';
export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; season: string; episode: string }>;
}) {
  const { id, season, episode } = await params;
  return <TvEpisodeWatch id={id} season={season} episode={episode} />;
}
