import { expect, it } from 'vitest';
import { parseRoomTvTitle, roomTitleSchema, roomTvEpisodeSchema, roomTvTitle } from './room-title';
it('accepts mapped room episodes and rejects unsupported titles, seasons and episode bounds', () => {
  expect(parseRoomTvTitle('moviebox:71446:2:1')).toEqual({ tvId: '71446', season: 2, episode: 1 });
  expect(parseRoomTvTitle('moviebox:71446:3:10')).toEqual({
    tvId: '71446',
    season: 3,
    episode: 10,
  });
  for (const value of [
    'moviebox:71446:1:1',
    'moviebox:99:2:1',
    'moviebox:71446:2:17',
    'moviebox:71446:3:11',
    'moviebox:71446:2:1:extra',
  ])
    expect(roomTitleSchema.safeParse(value).success).toBe(false);
});

it('keeps legacy catalog IDs separate from provider coordinates', () => {
  expect(parseRoomTvTitle('moviebox-source:71446:1:13')).toEqual({
    tvId: '71446',
    season: 1,
    episode: 13,
    numbering: 'provider',
  });
  expect(parseRoomTvTitle('moviebox-source:71446:5:10')).toEqual({
    tvId: '71446',
    season: 5,
    episode: 10,
    numbering: 'provider',
  });
  expect(parseRoomTvTitle('moviebox-source:71446:5:10:extra')).toBeNull();
  expect(parseRoomTvTitle('moviebox-source:71446:0:1')).toBeNull();
});

it('round trips KissKH source IDs without interpreting them as MovieBox', () => {
  const value = parseRoomTvTitle('kisskh:71446:1:1:2510:57281');
  expect(value).toEqual({
    provider: 'kisskh',
    tvId: '71446',
    season: 1,
    episode: 1,
    numbering: 'provider',
    seriesId: 2510,
    episodeId: 57281,
  });
  expect(roomTvEpisodeSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  expect(roomTvTitle(value!)).toBe('kisskh:71446:1:1:2510:57281');
  for (const invalid of [
    'kisskh:71446:1:1:2510',
    'kisskh:71446:1:1:2510:57281:extra',
    'kisskh:71446:1:1:0:57281',
    'kisskh:71446:1:1:2147483648:57281',
  ])
    expect(parseRoomTvTitle(invalid)).toBeNull();
});

it('preserves the direct KissKH mode in the room identity', () => {
  const value = parseRoomTvTitle('kisskh-direct:71446:1:3:2510:57283');
  expect(value).toMatchObject({ provider: 'kisskh-direct', seriesId: 2510, episodeId: 57283 });
  expect(roomTvTitle(value!)).toBe('kisskh-direct:71446:1:3:2510:57283');
});
