import { describe, expect, it } from 'vitest';
import {
  externalMediaSchema,
  parseExternalTitle,
  playbackSelectionSchema,
  selectionTitle,
} from './playback-selection';
import { playbackAssetKey, roomTitleSchema } from './room-title';
import { createRoomSchema } from './schemas';
import type { PlaybackState } from './sync/events';
const movieId = '00000000-0000-4000-8000-000000000001';
describe('external playback selection', () => {
  it('round trips movie and episode references without caller supplied URLs', () => {
    for (const selection of [
      { provider: 'vidsrc' as const, type: 'movie' as const, movieId },
      { provider: 'vidsrc' as const, type: 'tv' as const, tvId: 1399, season: 1, episode: 2 },
    ]) {
      const title = selectionTitle(selection);
      expect(roomTitleSchema.safeParse(title).success).toBe(true);
      expect(parseExternalTitle(title)).toEqual(selection);
      expect(playbackSelectionSchema.parse({ ...selection, url: 'https://bad.example' })).toEqual(
        selection,
      );
      expect(
        playbackAssetKey({ externalMedia: { ...selection, tmdbId: 1399 } } as PlaybackState),
      ).toBe(title);
    }
  });
  it('rejects invalid coordinates, ambiguous inputs and mismatched stored identities', () => {
    for (const value of [
      'vidsrc:movie:invalid',
      `vidsrc:movie:${movieId}:1`,
      'vidsrc:tv:1399:1:0',
      'vidsrc:tv:1e3:1:2',
      'vidsrc:tv:1399:1:2:extra',
    ])
      expect(parseExternalTitle(value)).toBeNull();
    expect(
      externalMediaSchema.safeParse({
        provider: 'vidsrc',
        type: 'tv',
        tvId: 1399,
        tmdbId: 71446,
        season: 1,
        episode: 1,
      }).success,
    ).toBe(false);
    expect(
      createRoomSchema.safeParse({
        name: 'Room',
        visibility: 'PRIVATE',
        movieId,
        playbackSelection: { provider: 'vidsrc', type: 'movie', movieId },
      }).success,
    ).toBe(false);
    expect(
      createRoomSchema.safeParse({
        name: 'Room',
        visibility: 'PRIVATE',
        playbackSelection: { provider: 'vidsrc', type: 'movie', movieId },
      }).success,
    ).toBe(true);
  });
});
