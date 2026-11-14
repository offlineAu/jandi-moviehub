import type { AnimeEpisode } from '@/lib/queries/anime';

/** Sources are already filtered to enabled, reviewed mappings for this episode. */
export function nextAnimeSource(
  sources: AnimeEpisode['sources'],
  currentId: string,
  attempted: string[],
) {
  const current = sources.find((source) => source.id === currentId);
  if (!current) return undefined;
  return sources.find(
    (source) =>
      !attempted.includes(source.id) &&
      source.edition === current.edition &&
      source.audioLanguage === current.audioLanguage &&
      source.subtitleLanguage === current.subtitleLanguage,
  );
}
