import { expect, it } from 'vitest';
import { parseRoomTvTitle, roomTitleSchema } from './room-title';
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
