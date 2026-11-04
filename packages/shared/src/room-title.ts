import { z } from 'zod';
import type { PlaybackState } from './sync/events';

export const roomTvEpisodeSchema = z
  .object({
    tvId: z.literal('71446'),
    season: z.union([z.literal(2), z.literal(3)]),
    episode: z.number().int().min(1).max(16),
  })
  .refine((v) => v.season !== 3 || v.episode <= 10);
export type RoomTvEpisode = z.infer<typeof roomTvEpisodeSchema>;
export const roomTitleSchema = z.union([
  z.uuid(),
  z.string().regex(/^moviebox:71446:(?:2:(?:[1-9]|1[0-6])|3:(?:[1-9]|10))$/),
]);
export function parseRoomTvTitle(value: string): RoomTvEpisode | null {
  const [provider, tvId, season, episode] = value.split(':');
  if (provider !== 'moviebox' || !roomTitleSchema.safeParse(value).success) return null;
  const parsed = roomTvEpisodeSchema.safeParse({
    tvId,
    season: Number(season),
    episode: Number(episode),
  });
  return parsed.success ? parsed.data : null;
}
export function roomTvTitle(value: RoomTvEpisode) {
  return `moviebox:${value.tvId}:${value.season}:${value.episode}`;
}
export function playbackAssetKey(state: PlaybackState | null | undefined) {
  return state?.tvEpisode ? roomTvTitle(state.tvEpisode) : (state?.mediaAssetId ?? null);
}
