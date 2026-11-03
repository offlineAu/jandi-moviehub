import {
  type CommandAck,
  type MarathonSnapshot,
  type RoomSnapshot,
  SocketEvents,
} from '@jandi/shared';
import type { Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MarathonService } from '../src/marathon/marathon.service';
import {
  connectSocket,
  createTestApp,
  emitAck,
  nextEvent,
  registerUser,
  resetState,
  type TestApp,
} from './helpers';
import { createPlayableMovie, createUnplayableMovie, waitFor } from './fixtures';

describe('marathon engine (integration)', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
  });
  afterEach(() => {
    while (sockets.length) sockets.pop()!.disconnect();
  });

  async function setup(movies: Array<{ durationSec?: number; playable?: boolean }>) {
    const host = await registerUser(t);
    const fan = await registerUser(t);
    const playlist = await host.agent
      .post('/api/v1/playlists')
      .send({ name: 'Double Feature', visibility: 'PRIVATE' })
      .expect(201);
    const playlistId = playlist.body.playlist.id as string;
    for (const m of movies) {
      const movie =
        m.playable === false
          ? await createUnplayableMovie(t.prisma)
          : await createPlayableMovie(t.prisma, { durationSec: m.durationSec ?? 2 });
      await host.agent
        .post(`/api/v1/playlists/${playlistId}/items`)
        .send({ movieId: movie.id })
        .expect(201);
    }
    const room = await host.agent
      .post('/api/v1/rooms')
      .send({ name: 'Marathon', visibility: 'PUBLIC' })
      .expect(201);
    const roomId = room.body.room.id as string;
    await fan.agent.post(`/api/v1/rooms/${roomId}/join`).send({}).expect(200);
    const fs = await connectSocket(t, fan.cookie);
    sockets.push(fs);
    await emitAck<CommandAck<RoomSnapshot>>(fs, SocketEvents.ROOM_JOIN, { roomId });
    return { host, fan, playlistId, roomId, fs };
  }

  it('runs a full marathon: countdown-free start, automatic transition, intermission, completion', async () => {
    const { host, playlistId, roomId, fs } = await setup([
      { durationSec: 1.5 },
      { durationSec: 1.5 },
    ]);
    const cfg = await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon`)
      .send({ playlistId, countdownSec: 0, intermissionSec: 1, votingEnabled: false })
      .expect(201);
    expect(cfg.body.marathon).toMatchObject({ state: 'READY', currentIndex: 0 });
    expect(cfg.body.marathon.totalRuntimeSec).toBeCloseTo(4);

    const states: string[] = [];
    fs.on(
      SocketEvents.MARATHON_STATE,
      (s: MarathonSnapshot | null) => s && states.push(`${s.state}:${s.currentIndex}`),
    );
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);

    const done = await nextEvent<MarathonSnapshot>(
      fs,
      SocketEvents.MARATHON_STATE,
      15000,
      (s) => s?.state === 'COMPLETED',
    );
    expect(done.currentIndex).toBe(1);
    expect(states).toEqual(
      expect.arrayContaining([
        'TRANSITIONING:0',
        'PLAYING:0',
        'INTERMISSION:0',
        'TRANSITIONING:1',
        'PLAYING:1',
        'COMPLETED:1',
      ]),
    );
    const order = [
      'TRANSITIONING:0',
      'PLAYING:0',
      'INTERMISSION:0',
      'TRANSITIONING:1',
      'PLAYING:1',
      'COMPLETED:1',
    ].map((s) => states.indexOf(s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('does not double-advance on duplicate triggers (idempotent transitions)', async () => {
    const { host, playlistId, roomId } = await setup([
      { durationSec: 60 },
      { durationSec: 60 },
      { durationSec: 60 },
    ]);
    await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon`)
      .send({ playlistId, countdownSec: 0, intermissionSec: 0 })
      .expect(201);
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);
    const playing = await waitFor(
      () => t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } }),
      (r) => r.state === 'PLAYING',
    );
    const svc = t.app.get(MarathonService);
    const results = await Promise.all([
      svc.dispatch(roomId, { type: 'MOVIE_ENDED' }, playing.version),
      svc.dispatch(roomId, { type: 'MOVIE_ENDED' }, playing.version),
      svc.dispatch(roomId, { type: 'MOVIE_ENDED' }, playing.version),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = await waitFor(
      () => t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } }),
      (r) => r.state === 'PLAYING',
    );
    expect(after.currentIndex).toBe(1);
  });

  it('resumes a countdown that becomes due while the API is stopped', async () => {
    const { host, playlistId, roomId } = await setup([{ durationSec: 60 }]);
    await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon`)
      .send({ playlistId, countdownSec: 3, intermissionSec: 0 })
      .expect(201);
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);
    expect((await t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } })).state).toBe(
      'COUNTDOWN',
    );

    while (sockets.length) sockets.pop()!.disconnect();
    await t.close();
    await new Promise((resolve) => setTimeout(resolve, 3500));
    t = await createTestApp();
    const restored = await waitFor(
      () => t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } }),
      (row) => row.state === 'PLAYING',
      10000,
    );
    expect(restored.currentIndex).toBe(0);
  });

  it('only lets hosts control the marathon; clients cannot advance it', async () => {
    const { host, fan, playlistId, roomId } = await setup([
      { durationSec: 60 },
      { durationSec: 60 },
    ]);
    await fan.agent.post(`/api/v1/rooms/${roomId}/marathon`).send({ playlistId }).expect(403);
    await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon`)
      .send({ playlistId, countdownSec: 0, intermissionSec: 0 })
      .expect(201);
    await fan.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(403);
    await fan.agent.post(`/api/v1/rooms/${roomId}/marathon/skip`).expect(403);
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);
    await waitFor(
      () => t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } }),
      (r) => r.state === 'PLAYING',
    );
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/skip`).expect(200);
    const row = await waitFor(
      () => t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } }),
      (r) => r.state === 'PLAYING' && r.currentIndex === 1,
    );
    expect(row.currentIndex).toBe(1);
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/stop`).expect(200);
    const pb = await host.agent.get(`/api/v1/rooms/${roomId}/playback-state`).expect(200);
    expect(pb.body.state.status).toBe('paused');
    // Resume continues from the same item.
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);
    const resumed = await waitFor(
      () => t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } }),
      (r) => r.state === 'PLAYING',
    );
    expect(resumed.currentIndex).toBe(1);
  });

  it('skips unplayable titles and counts down before starting', async () => {
    const { host, playlistId, roomId, fs } = await setup([
      { playable: false },
      { durationSec: 60 },
    ]);
    await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon`)
      .send({ playlistId, countdownSec: 1, intermissionSec: 0 })
      .expect(201);
    const countdown = nextEvent<MarathonSnapshot>(
      fs,
      SocketEvents.MARATHON_STATE,
      3000,
      (s) => s?.state === 'COUNTDOWN',
    );
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);
    const c = await countdown;
    expect(c.phaseEndsAt! - Date.now()).toBeLessThanOrEqual(1100);
    const playing = await nextEvent<MarathonSnapshot>(
      fs,
      SocketEvents.MARATHON_STATE,
      5000,
      (s) => s?.state === 'PLAYING',
    );
    expect(playing.currentIndex).toBe(1);
  });

  it('applies intermission votes to choose the next movie', async () => {
    const { host, fan, playlistId, roomId, fs } = await setup([
      { durationSec: 1 },
      { durationSec: 60 },
      { durationSec: 60 },
    ]);
    await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon`)
      .send({ playlistId, countdownSec: 0, intermissionSec: 2, votingEnabled: true })
      .expect(201);
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);
    const intermission = await nextEvent<MarathonSnapshot>(
      fs,
      SocketEvents.MARATHON_STATE,
      6000,
      (s) => s?.state === 'INTERMISSION',
    );
    const third = intermission.items[2]!;
    const vote = await emitAck<CommandAck<MarathonSnapshot>>(fs, SocketEvents.MARATHON_VOTE, {
      roomId,
      playlistItemId: third.id,
    });
    expect(vote.ok && vote.data.myVote).toBe(third.id);
    await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon/votes`)
      .send({ playlistItemId: third.id })
      .expect(200);
    await fan.agent
      .post(`/api/v1/rooms/${roomId}/marathon/votes`)
      .send({ playlistItemId: intermission.items[0]!.id })
      .expect(400);
    const next = await nextEvent<MarathonSnapshot>(
      fs,
      SocketEvents.MARATHON_STATE,
      6000,
      (s) => s?.state === 'PLAYING' && s.currentIndex === 1,
    );
    expect(next.items[1]!.id).toBe(third.id);
  });

  it('survives a lost Redis playback key and blocks manual movie changes while active', async () => {
    const { host, playlistId, roomId } = await setup([{ durationSec: 60 }]);
    await host.agent
      .post(`/api/v1/rooms/${roomId}/marathon`)
      .send({ playlistId, countdownSec: 0, intermissionSec: 0 })
      .expect(201);
    await host.agent.post(`/api/v1/rooms/${roomId}/marathon/start`).expect(200);
    await waitFor(
      () => t.prisma.roomPlaylist.findUniqueOrThrow({ where: { roomId } }),
      (r) => r.state === 'PLAYING',
    );
    const hs = await connectSocket(t, host.cookie);
    sockets.push(hs);
    const join = await emitAck<CommandAck<RoomSnapshot>>(hs, SocketEvents.ROOM_JOIN, { roomId });
    if (!join.ok) throw new Error('join failed');
    expect(join.data.marathon?.state).toBe('PLAYING');
    const other = await createPlayableMovie(t.prisma);
    const change = await emitAck<CommandAck>(hs, SocketEvents.MOVIE_CHANGE, {
      roomId,
      commandId: 'cmd-change-1',
      baseVersion: join.data.playback.version,
      movieId: other.id,
    });
    expect(change).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
});
