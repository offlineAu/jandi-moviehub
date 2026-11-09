import { describe, expect, it, vi } from 'vitest';
import { parseVidsrcEvent, VidsrcAdapter, VIDSRC_ORIGIN } from './vidsrc-adapter';
const media = {
  provider: 'vidsrc' as const,
  type: 'tv' as const,
  tmdbId: 1399,
  tvId: 1399,
  season: 1,
  episode: 2,
};
function setup() {
  let now = 100000;
  const postMessage = vi.fn();
  const window = { postMessage } as unknown as Window;
  const frame = { contentWindow: window } as HTMLIFrameElement;
  const adapter = new VidsrcAdapter(frame, media, () => now);
  const event = (status = 'playing', position = 5, extra = {}) => ({
    origin: VIDSRC_ORIGIN,
    source: window,
    data: {
      type: 'PLAYER_EVENT',
      data: {
        player_info: { tmdb: '1399', mediaType: 'tv', season: 1, episode: 2, ...extra },
        player_status: status,
        player_progress: position,
        player_duration: 600,
      },
    },
  });
  return {
    adapter,
    event,
    frame,
    postMessage,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe('VidSrc adapter', () => {
  it('requires the active origin, frame and exact media identity', () => {
    const { event, frame } = setup();
    expect(parseVidsrcEvent(event(), frame.contentWindow, media)).toMatchObject({ position: 5 });
    expect(
      parseVidsrcEvent({ ...event(), origin: 'https://evil.example' }, frame.contentWindow, media),
    ).toBeNull();
    expect(
      parseVidsrcEvent({ ...event(), source: {} as Window }, frame.contentWindow, media),
    ).toBeNull();
    expect(
      parseVidsrcEvent(event('playing', 5, { episode: 3 }), frame.contentWindow, media),
    ).toBeNull();
    expect(parseVidsrcEvent(event('playing', Infinity), frame.contentWindow, media)).toBeNull();
    expect(parseVidsrcEvent({ ...event(), data: '{bad' }, frame.contentWindow, media)).toBeNull();
  });
  it('waits for activation, sends commands to the exact origin and suppresses command echoes', async () => {
    const { adapter, event, postMessage } = setup();
    const seek = vi.fn();
    const play = vi.fn();
    const pause = vi.fn();
    adapter.addEventListener('seeking', seek);
    adapter.addEventListener('play', play);
    adapter.addEventListener('pause', pause);
    await adapter.play();
    expect(postMessage).not.toHaveBeenCalled();
    adapter.accept(event());
    expect(adapter.status).toBe('ready');
    expect(play).not.toHaveBeenCalled(); // activating the player is not a host command
    adapter.pause();
    expect(postMessage).toHaveBeenLastCalledWith({ player: true, action: 'pause' }, VIDSRC_ORIGIN);
    adapter.accept(event('paused'));
    expect(pause).not.toHaveBeenCalled();
    adapter.currentTime = 60;
    adapter.accept(event('seeked', 60));
    expect(seek).not.toHaveBeenCalled();
    adapter.accept(event('seeked', 100));
    expect(seek).toHaveBeenCalledOnce();
    adapter.accept(event('playing', 100));
    expect(play).toHaveBeenCalledOnce();
  });
  it('extrapolates progress, stops corrections on stale telemetry, and discards destroyed frames', () => {
    const { adapter, event, advance, postMessage } = setup();
    adapter.accept(event());
    advance(5000);
    expect(adapter.currentTime).toBe(10);
    advance(11000);
    expect(adapter.status).toBe('unknown');
    expect(adapter.readyState).toBe(0);
    adapter.currentTime = 100;
    expect(postMessage).not.toHaveBeenCalled();
    adapter.accept(event('playing', 25));
    expect(adapter.readyState).toBe(4);
    adapter.destroy();
    expect(adapter.accept(event())).toBe(false);
    expect(adapter.readyState).toBe(0);
  });
});
