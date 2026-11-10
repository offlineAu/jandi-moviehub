import { type PlaybackState, SocketEvents } from '@jandi/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomSyncEngine, type SyncSocket } from './room-sync';

class FakeVideo {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  readyState = 4;
  plays = 0;
  pauses = 0;
  private handlers = new Map<string, Array<() => void>>();
  play() {
    this.plays += 1;
    this.paused = false;
    this.fire('play');
    return Promise.resolve();
  }
  pause() {
    this.pauses += 1;
    this.paused = true;
    this.fire('pause');
  }
  addEventListener(e: string, fn: () => void) {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), fn]);
  }
  removeEventListener(e: string, fn: () => void) {
    this.handlers.set(
      e,
      (this.handlers.get(e) ?? []).filter((f) => f !== fn),
    );
  }
  fire(e: string) {
    for (const fn of this.handlers.get(e) ?? []) fn();
  }
}

const state = (patch: Partial<PlaybackState> = {}): PlaybackState => ({
  roomId: 'room',
  version: 3,
  movieId: 'm',
  mediaAssetId: 'a',
  status: 'paused',
  positionSec: 10,
  rate: 1,
  anchorServerTime: 1_000_000,
  durationSec: 600,
  updatedBy: null,
  lastCommandId: null,
  ...patch,
});

function makeSocket(snapshotState: PlaybackState, canControl: boolean, clockNow: () => number) {
  const emitted: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const handlers = new Map<string, (p: unknown) => void>();
  const responders: Record<string, (payload: Record<string, unknown>) => unknown> = {
    [SocketEvents.ROOM_JOIN]: () => ({
      ok: true,
      data: {
        playback: snapshotState,
        you: { canControl, role: canControl ? 'HOST' : 'MEMBER', userId: 'u' },
        members: [],
        marathon: null,
        room: {},
        serverTime: clockNow(),
      },
    }),
    [SocketEvents.CLOCK_PING]: (p) => ({ clientSentAt: p.clientSentAt, serverTime: clockNow() }),
  };
  const socket: SyncSocket & {
    respond: typeof responders;
    emitted: typeof emitted;
    push: (e: string, p: unknown) => void;
  } = {
    connected: true,
    emitted,
    respond: responders,
    on: (e: string, fn: (p: unknown) => void) => handlers.set(e, fn),
    off: (e: string) => handlers.delete(e),
    push: (e: string, p: unknown) => handlers.get(e)?.(p),
    timeout: () => ({
      emitWithAck: async (event: string, payload: unknown) => {
        emitted.push({ event, payload: payload as Record<string, unknown> });
        return responders[event]?.(payload as Record<string, unknown>) ?? { ok: true, data: {} };
      },
    }),
  } as never;
  return socket;
}

describe('RoomSyncEngine', () => {
  let now = 1_000_000;
  const clock = () => now;
  beforeEach(() => {
    now = 1_000_000;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => vi.useRealTimers());

  async function setup(initial: PlaybackState, canControl = false) {
    const socket = makeSocket(initial, canControl, clock);
    const video = new FakeVideo();
    const errors: string[] = [];
    const engine = new RoomSyncEngine(socket, 'room', {
      now: clock,
      onError: (m) => errors.push(m),
    });
    engine.attachVideo(video as unknown as HTMLVideoElement);
    await engine.join();
    await new Promise((r) => setTimeout(r, 1)); // release apply guards
    return { socket, video, engine, errors };
  }

  it('aligns a late joiner with a playing room', async () => {
    now = 1_005_000; // 5 s after the anchor
    const { video } = await setup(state({ status: 'playing' }));
    expect(video.paused).toBe(false);
    expect(video.currentTime).toBeCloseTo(15.05, 1);
  });

  it('does not send commands for viewers and reverts their local changes', async () => {
    const { socket, video, engine, errors } = await setup(state({ status: 'playing' }));
    expect(await engine.intent({ type: 'pause' })).toBe(false);
    expect(errors[0]).toMatch(/hosts/);
    expect(socket.emitted.some((e) => e.event === SocketEvents.PLAYBACK_PAUSE)).toBe(false);
    // A media-key pause outside the engine is reverted.
    const plays = video.plays;
    video.paused = true;
    video.fire('pause');
    expect(video.plays).toBe(plays + 1);
  });

  it('turns controller intents into versioned commands and applies the ack', async () => {
    const { socket, video, engine } = await setup(state(), true);
    socket.respond[SocketEvents.PLAYBACK_PLAY] = () => ({
      ok: true,
      data: state({ status: 'playing', version: 4, anchorServerTime: now }),
    });
    expect(await engine.intent({ type: 'play' })).toBe(true);
    const sent = socket.emitted.find((e) => e.event === SocketEvents.PLAYBACK_PLAY)!;
    expect(sent.payload.baseVersion).toBe(3);
    expect(typeof sent.payload.commandId).toBe('string');
    expect(video.paused).toBe(false);
    expect(engine.current?.version).toBe(4);
  });

  it('retries once on STALE using the fresh state', async () => {
    const { socket, engine } = await setup(state(), true);
    let calls = 0;
    socket.respond[SocketEvents.PLAYBACK_SEEK] = (p) => {
      calls += 1;
      if (calls === 1)
        return {
          ok: false,
          error: { code: 'STALE', message: 'stale' },
          state: state({ version: 7 }),
        };
      expect(p.baseVersion).toBe(7);
      return { ok: true, data: state({ version: 8, positionSec: 30 }) };
    };
    expect(await engine.intent({ type: 'seek', positionSec: 30 })).toBe(true);
    expect(calls).toBe(2);
  });

  it('converts an external pause into a command for controllers', async () => {
    const { socket, video } = await setup(state({ status: 'playing' }), true);
    socket.respond[SocketEvents.PLAYBACK_PAUSE] = () => ({ ok: true, data: state({ version: 4 }) });
    video.paused = true;
    video.fire('pause');
    await Promise.resolve();
    expect(socket.emitted.some((e) => e.event === SocketEvents.PLAYBACK_PAUSE)).toBe(true);
  });

  it('nudges the rate for small drift and seeks (with cooldown) for large drift', async () => {
    const { video, engine } = await setup(state({ status: 'playing' }));
    video.currentTime = 10.4; // 0.4 s ahead
    engine.tick();
    expect(video.playbackRate).toBeLessThan(1);
    expect(video.playbackRate).toBeGreaterThan(0.9);

    now += 2500; // past the cooldown of the corrective seek made on join
    video.currentTime = 22.5; // 10 s ahead of expected 12.5
    engine.tick();
    expect(video.currentTime).toBeCloseTo(12.55, 1);
    expect(video.playbackRate).toBe(1);
    video.currentTime = 30;
    engine.tick(); // within cooldown: no second seek
    expect(video.currentTime).toBe(30);
    now += 2500;
    engine.tick();
    expect(video.currentTime).toBeCloseTo(15.05, 1);
  });

  it('does not repeatedly seek a buffering player, then catches up when it resumes', async () => {
    const { video, engine, socket } = await setup(state({ status: 'playing' }));
    video.fire('waiting');
    now += 5000;
    video.currentTime = 8;
    engine.tick();
    expect(video.currentTime).toBe(8);
    now += 5000;
    engine.tick();
    expect(video.currentTime).toBe(8);
    expect(socket.emitted.some((event) => event.event === SocketEvents.PLAYBACK_BUFFERING)).toBe(
      true,
    );
    video.fire('playing');
    engine.tick();
    expect(video.currentTime).toBeCloseTo(20.05, 1);
    expect(socket.emitted.some((event) => event.event === SocketEvents.PLAYBACK_RECOVERED)).toBe(
      true,
    );
  });

  it('does not mark a playing video as buffering for a stalled download alone', async () => {
    const { video, socket } = await setup(state({ status: 'playing' }));
    video.fire('stalled');
    expect(socket.emitted.some((event) => event.event === SocketEvents.PLAYBACK_BUFFERING)).toBe(
      false,
    );
  });

  it('ignores out-of-order broadcasts', async () => {
    const { socket, engine } = await setup(state({ version: 5 }));
    socket.push(SocketEvents.PLAYBACK_SYNC, { state: state({ version: 4, positionSec: 99 }) });
    expect(engine.current?.version).toBe(5);
    socket.push(SocketEvents.PLAYBACK_SYNC, { state: state({ version: 6, positionSec: 50 }) });
    expect(engine.current?.positionSec).toBe(50);
  });

  it('sends heartbeats with measured drift', async () => {
    const { socket, video } = await setup(state({ status: 'playing' }));
    video.currentTime = 10.2;
    await vi.advanceTimersByTimeAsync(5000);
    const hb = socket.emitted.find((e) => e.event === SocketEvents.PLAYBACK_HEARTBEAT)!;
    expect(hb.payload.driftSec as number).toBeCloseTo(0.2, 1);
  });
});

it('corrects embed drift with seeks, suppresses echoes, and stops without fresh telemetry', async () => {
  const { VidsrcAdapter } = await import('./vidsrc-adapter');
  let now = 1000000;
  const media = {
    provider: 'vidsrc' as const,
    type: 'tv' as const,
    tvId: 1399,
    tmdbId: 1399,
    season: 1,
    episode: 2,
  };
  const socket = makeSocket(
    state({
      externalMedia: media,
      movieId: null,
      mediaAssetId: null,
      status: 'playing',
      positionSec: 100,
      anchorServerTime: now,
    }),
    false,
    () => now,
  );
  const engine = new RoomSyncEngine(socket, 'room', { now: () => now });
  const postMessage = vi.fn();
  const frameWindow = { postMessage } as unknown as Window;
  const adapter = new VidsrcAdapter(
    { contentWindow: frameWindow } as HTMLIFrameElement,
    media,
    () => now,
  );
  engine.attachPlayer(adapter);
  const event = (status: string, position: number) => ({
    origin: 'https://vidsrc.sh',
    source: frameWindow,
    data: {
      type: 'PLAYER_EVENT',
      data: {
        player_info: { tmdb: 1399, mediaType: 'tv', season: 1, episode: 2 },
        player_status: status,
        player_progress: position,
        player_duration: 600,
      },
    },
  });
  try {
    await engine.join();
    expect(postMessage).not.toHaveBeenCalled();
    adapter.accept(event('playing', 20));
    expect(postMessage).toHaveBeenCalledWith(
      { player: true, action: 'seek100.050' },
      'https://vidsrc.sh',
    );
    adapter.accept(event('seeked', 100.05));
    expect(socket.emitted.filter((item) => item.event === SocketEvents.PLAYBACK_SEEK)).toHaveLength(
      0,
    );
    now += 11000;
    adapter.accept(event('playing', 105));
    engine.tick();
    expect(postMessage).toHaveBeenLastCalledWith(
      { player: true, action: 'seek111.000' },
      'https://vidsrc.sh',
    );
    const sent = postMessage.mock.calls.length;
    now += 16000;
    engine.tick();
    expect(postMessage.mock.calls.length).toBe(sent);
    expect(await engine.intent({ type: 'rate', rate: 1.5 })).toBe(false);
  } finally {
    engine.destroy();
    adapter.destroy();
  }
});
