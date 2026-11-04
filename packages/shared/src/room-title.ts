import { z } from 'zod';
import type { PlaybackState } from './sync/events';

const legacyRoomEpisodeSchema = z
  .object({
    tvId: z.literal('71446'),
    season: z.union([z.literal(2), z.literal(3)]),
    episode: z.number().int().min(1).max(16),
    numbering: z.undefined().optional(),
  })
  .refine((v) => v.season !== 3 || v.episode <= 10);
const providerRoomEpisodeSchema = z.object({
  tvId: z.literal('71446'),
  season: z.number().int().min(1).max(100),
  episode: z.number().int().min(1).max(1000),
  numbering: z.literal('provider'),
});
export const roomTvEpisodeSchema = z.union([legacyRoomEpisodeSchema, providerRoomEpisodeSchema]);
export type RoomTvEpisode = z.infer<typeof roomTvEpisodeSchema>;
const providerTitle = /^moviebox-source:71446:([1-9]\d?|100):([1-9]\d{0,2}|1000)$/;
export const roomTitleSchema = z.union([
  z.uuid(),
  z.string().regex(/^moviebox:71446:(?:2:(?:[1-9]|1[0-6])|3:(?:[1-9]|10))$/),
  z.string().regex(providerTitle),
]);
export function parseRoomTvTitle(value: string): RoomTvEpisode | null {
  const [provider, tvId, season, episode] = value.split(':');
  if (
    !['moviebox', 'moviebox-source'].includes(provider!) ||
    !roomTitleSchema.safeParse(value).success
  )
    return null;
  const parsed = roomTvEpisodeSchema.safeParse({
    tvId,
    season: Number(season),
    episode: Number(episode),
    ...(provider === 'moviebox-source' ? { numbering: 'provider' } : {}),
  });
  return parsed.success ? parsed.data : null;
}
export function roomTvTitle(value: RoomTvEpisode) {
  return `${value.numbering === 'provider' ? 'moviebox-source' : 'moviebox'}:${value.tvId}:${value.season}:${value.episode}`;
}
export function playbackAssetKey(state: PlaybackState | null | undefined) {
  return state?.tvEpisode ? roomTvTitle(state.tvEpisode) : (state?.mediaAssetId ?? null);
}
