import { z } from 'zod';
import type { PlaybackState } from './sync/events';

const legacyRoomEpisodeSchema = z
  .object({
    provider: z.undefined().optional(),
    tvId: z.literal('71446'),
    season: z.union([z.literal(2), z.literal(3)]),
    episode: z.number().int().min(1).max(16),
    numbering: z.undefined().optional(),
  })
  .refine((v) => v.season !== 3 || v.episode <= 10);
const providerRoomEpisodeSchema = z.object({
  provider: z.undefined().optional(),
  tvId: z.literal('71446'),
  season: z.number().int().min(1).max(100),
  episode: z.number().int().min(1).max(1000),
  numbering: z.literal('provider'),
});
const kisskhRoomEpisodeSchema = z.object({
  provider: z.literal('kisskh'),
  tvId: z.literal('71446'),
  season: z.number().int().min(1).max(100),
  episode: z.number().int().min(1).max(1000),
  seriesId: z.number().int().positive().max(2147483647),
  episodeId: z.number().int().positive().max(2147483647),
  numbering: z.literal('provider'),
});
export const roomTvEpisodeSchema = z.union([
  legacyRoomEpisodeSchema,
  providerRoomEpisodeSchema,
  kisskhRoomEpisodeSchema,
]);
export type RoomTvEpisode = z.infer<typeof roomTvEpisodeSchema>;
const kisskhTitle =
  /^kisskh:71446:([1-9]\d?|100):([1-9]\d{0,2}|1000):([1-9]\d{0,9}):([1-9]\d{0,9})$/;
const providerTitle = /^moviebox-source:71446:([1-9]\d?|100):([1-9]\d{0,2}|1000)$/;
export const roomTitleSchema = z.union([
  z.uuid(),
  z.string().regex(/^moviebox:71446:(?:2:(?:[1-9]|1[0-6])|3:(?:[1-9]|10))$/),
  z.string().regex(providerTitle),
  z
    .string()
    .regex(kisskhTitle)
    .refine((value) => {
      const [, , , , seriesId, episodeId] = value.split(':');
      return Number(seriesId) <= 2147483647 && Number(episodeId) <= 2147483647;
    }),
]);
export function parseRoomTvTitle(value: string): RoomTvEpisode | null {
  const [provider, tvId, season, episode, seriesId, episodeId] = value.split(':');
  if (
    !['moviebox', 'moviebox-source', 'kisskh'].includes(provider!) ||
    !roomTitleSchema.safeParse(value).success
  )
    return null;
  const parsed = roomTvEpisodeSchema.safeParse({
    tvId,
    season: Number(season),
    episode: Number(episode),
    ...(provider === 'moviebox-source' || provider === 'kisskh' ? { numbering: 'provider' } : {}),
    ...(provider === 'kisskh'
      ? { provider, seriesId: Number(seriesId), episodeId: Number(episodeId) }
      : {}),
  });
  return parsed.success ? parsed.data : null;
}
export function roomTvTitle(value: RoomTvEpisode) {
  if (value.provider === 'kisskh')
    return `kisskh:${value.tvId}:${value.season}:${value.episode}:${value.seriesId}:${value.episodeId}`;
  return `${value.numbering === 'provider' ? 'moviebox-source' : 'moviebox'}:${value.tvId}:${value.season}:${value.episode}`;
}
export function playbackAssetKey(state: PlaybackState | null | undefined) {
  return state?.tvEpisode ? roomTvTitle(state.tvEpisode) : (state?.mediaAssetId ?? null);
}
