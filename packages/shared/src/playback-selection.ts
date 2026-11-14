import { z } from 'zod';

const id = z.number().int().positive().max(2147483647);
export const animeSelectionSchema = z.object({
  provider: z.literal('anime'),
  type: z.literal('anime'),
  sourceId: z.uuid(),
});
const tmdbSelectionSchema = z.union([
  z.object({ provider: z.literal('vidsrc'), type: z.literal('movie'), movieId: z.uuid() }),
  z.object({ provider: z.literal('kisskh-direct'), type: z.literal('movie'), movieId: z.uuid() }),
  z.object({
    provider: z.literal('vidsrc'),
    type: z.literal('tv'),
    tvId: id,
    season: z.number().int().min(0).max(1000),
    episode: z.number().int().min(1).max(10000),
  }),
]);
export const externalSelectionSchema = z.union([
  animeSelectionSchema,
  ...tmdbSelectionSchema.options,
]);
export const playbackSelectionSchema = z.union([
  z.object({ provider: z.literal('native'), movieId: z.uuid() }),
  externalSelectionSchema,
  z.object({
    provider: z.literal('kisskh'),
    tvId: z.literal('71446'),
    season: z.number().int().min(1).max(100),
    episode: z.number().int().min(1).max(1000),
    seriesId: id,
    episodeId: id,
    numbering: z.literal('provider'),
  }),
]);
export const externalMediaSchema = z.union([
  animeSelectionSchema.extend({ episodeId: z.uuid(), edition: z.string().min(1).max(200) }),
  z
    .intersection(tmdbSelectionSchema, z.object({ tmdbId: id }))
    .refine((media) => media.type !== 'tv' || media.tmdbId === media.tvId, {
      message: 'Series identity mismatch',
    }),
]);
export type PlaybackSelection = z.infer<typeof playbackSelectionSchema>;
export type ExternalMedia = z.infer<typeof externalMediaSchema>;
export function selectionTitle(value: PlaybackSelection): string {
  if (value.provider === 'anime') return `anime:anime:${value.sourceId}`;
  if (value.provider === 'native') return value.movieId;
  if (value.provider === 'kisskh')
    return `kisskh:${value.tvId}:${value.season}:${value.episode}:${value.seriesId}:${value.episodeId}`;
  return value.type === 'movie'
    ? `${value.provider}:movie:${value.movieId}`
    : `vidsrc:tv:${value.tvId}:${value.season}:${value.episode}`;
}
export function parseExternalTitle(value: string) {
  const [provider, type, id, season, episode, ...extra] = value.split(':');
  if (
    provider === 'anime' &&
    type === 'anime' &&
    season === undefined &&
    episode === undefined &&
    !extra.length
  ) {
    const result = animeSelectionSchema.safeParse({ provider, type, sourceId: id });
    return result.success ? result.data : null;
  }
  if (
    !['vidsrc', 'kisskh-direct'].includes(provider ?? '') ||
    extra.length ||
    (type === 'tv' &&
      [id, season, episode].some((part) => !part || String(Number(part)) !== part)) ||
    (type === 'movie' && (season !== undefined || episode !== undefined))
  )
    return null;
  const parsed = externalSelectionSchema.safeParse(
    type === 'movie'
      ? { provider, type, movieId: id }
      : { provider, type, tvId: Number(id), season: Number(season), episode: Number(episode) },
  );
  return parsed.success ? parsed.data : null;
}
