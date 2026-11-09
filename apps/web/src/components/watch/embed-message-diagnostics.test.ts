import { expect, it } from 'vitest';
import { describeEmbedMessage } from './embed-message-diagnostics';
it('summarizes rejected events without exposing arbitrary provider data', () => {
  const frame = {} as Window;
  const event = {
    origin: 'https://vidsrc.sh',
    source: frame,
    data: {
      type: 'PLAYER_EVENT',
      data: {
        player_info: { tmdb: null, imdb: 'tt0468569', mediaType: 'movie' },
        player_progress: '5',
        player_duration: 600,
        streamUrl: 'https://private.example/token=secret',
      },
    },
  };
  const summary = describeEmbedMessage(event, frame)!;
  expect(JSON.parse(summary)).toMatchObject({
    sameFrame: true,
    tmdb: null,
    imdb: 'tt0468569',
    progressType: 'string',
  });
  expect(summary).not.toContain('secret');
  expect(
    describeEmbedMessage(
      { origin: 'https://unrelated.example', source: {} as Window, data: { type: 'unrelated' } },
      frame,
    ),
  ).toBeNull();
});
