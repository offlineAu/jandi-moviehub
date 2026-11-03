import { describe, expect, it } from 'vitest';
import { isExternalPlaybackEvent } from './external-player-events';

describe('external player events', () => {
  it('only accepts a playback event from the expected frame and origin', () => {
    const frame = {} as Window;
    const event = {
      origin: 'https://vidsrc.sh',
      source: frame,
      data: { type: 'PLAYER_EVENT', data: { player_status: 'playing' } },
    };
    expect(isExternalPlaybackEvent(event, frame)).toBe(true);
    expect(isExternalPlaybackEvent({ ...event, origin: 'https://other.example' }, frame)).toBe(
      false,
    );
    expect(isExternalPlaybackEvent(event, {} as Window)).toBe(false);
    expect(
      isExternalPlaybackEvent(
        { ...event, data: { type: 'PLAYER_EVENT', data: { player_status: 'paused' } } },
        frame,
      ),
    ).toBe(false);
  });
});
