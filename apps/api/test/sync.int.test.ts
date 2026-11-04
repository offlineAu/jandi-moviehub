import {
  type CommandAck,
  expectedPosition,
  type PlaybackState,
  type RoomSnapshot,
  SocketEvents,
} from '@jandi/shared';
import { MovieboxService } from '../src/catalog/moviebox.controller';
import { PlaybackService } from '../src/realtime/playback.service';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  connectSocket,
  emitAck,
  nextEvent,
  ORIGIN,
  registerUser,
  resetState,
  createTestApp,
  type TestApp,
  type TestUser,
} from './helpers';
import { createPlayableMovie, sleep, waitFor } from './fixtures';

type Ack = CommandAck<PlaybackState>;

describe('real-time playback sync (integration)', () => {
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

  async function setup(opts: { durationSec?: number; controlPolicy?: string } = {}) {
    const host = await registerUser(t);
    const viewer = await registerUser(t);
    const movie = await createPlayableMovie(t.prisma, { durationSec: opts.durationSec ?? 600 });
    const res = await host.agent
      .post('/api/v1/rooms')
      .send({
        name: 'Sync Test',
        visibility: 'PUBLIC',
        movieId: movie.id,
        controlPolicy: opts.controlPolicy ?? 'HOSTS',
      })
      .expect(201);
    const roomId = res.body.room.id as string;
    await viewer.agent.post(`/api/v1/rooms/${roomId}/join`).send({}).expect(200);
    return { host, viewer, roomId, movie };
  }

  async function joinSocket(user: TestUser, roomId: string) {
    const socket = await connectSocket(t, user.cookie);
    sockets.push(socket);
    const ack = await emitAck<CommandAck<RoomSnapshot>>(socket, SocketEvents.ROOM_JOIN, { roomId });
    if (!ack.ok) throw new Error(`join failed: ${JSON.stringify(ack)}`);
    return { socket, snapshot: ack.data };
  }

  const cmd = (roomId: string, baseVersion: number, extra: Record<string, unknown> = {}) => ({
    roomId,
    commandId: randomUUID(),
    baseVersion,
    ...extra,
  });

  it('synchronizes TV episodes, restores them from storage, and enforces host controls', async () => {
    const provider = vi
      .spyOn(t.app.get(MovieboxService), 'playback')
      .mockResolvedValue({
        durationSec: 3059,
        audioLanguage: 'es',
        sources: [],
        englishVtt: null,
        subtitleStatus: 'UNAVAILABLE',
      });
    try {
      const host = await registerUser(t);
      const viewer = await registerUser(t);
      const created = await host.agent
        .post('/api/v1/rooms')
        .send({
          name: 'TV sync test',
          visibility: 'PUBLIC',
          controlPolicy: 'HOSTS',
          movieId: 'moviebox:71446:2:1',
        })
        .expect(201);
      const roomId = created.body.room.id;
      await viewer.agent.post(`/api/v1/rooms/${roomId}/join`).send({}).expect(200);
      const a = await joinSocket(host, roomId);
      const b = await joinSocket(viewer, roomId);
      const state = await t.app.get(PlaybackService).getState(roomId);
      expect(state).toMatchObject({
        movieId: null,
        mediaAssetId: null,
        tvEpisode: { tvId: '71446', season: 2, episode: 1 },
        status: 'paused',
      });
      const denied = await emitAck<Ack>(
        b.socket,
        SocketEvents.PLAYBACK_PLAY,
        cmd(roomId, state.version),
      );
      expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      const playing = await emitAck<Ack>(
        a.socket,
        SocketEvents.PLAYBACK_PLAY,
        cmd(roomId, state.version),
      );
      expect(playing).toMatchObject({ ok: true, data: { status: 'playing' } });
      if (!playing.ok) throw new Error('Play failed');
      const seek = await emitAck<Ack>(
        a.socket,
        SocketEvents.PLAYBACK_SEEK,
        cmd(roomId, playing.data.version, { positionSec: 120 }),
      );
      expect(seek).toMatchObject({ ok: true, data: { positionSec: 120 } });
      await t.redis.del(`pb:${roomId}`);
      const restored = await t.app.get(PlaybackService).getState(roomId);
      expect(restored.tvEpisode).toEqual(state.tvEpisode);
      const changed = await emitAck<Ack>(
        a.socket,
        SocketEvents.MOVIE_CHANGE,
        cmd(roomId, restored.version, { movieId: 'moviebox:71446:2:2' }),
      );
      expect(changed).toMatchObject({
        ok: true,
        data: { status: 'paused', positionSec: 0, tvEpisode: { episode: 2 } },
      });
    } finally {
      provider.mockRestore();
    }
  });

  it('rejects unauthenticated and cross-origin sockets', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const s = io(t.baseUrl, {
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
          extraHeaders: { origin: ORIGIN },
        });
        s.once('connect', () => resolve(s));
        s.once('connect_error', (e) => reject(e));
      }),
    ).rejects.toThrow(/UNAUTHENTICATED/);
    const user = await registerUser(t);
    await expect(
      new Promise((resolve, reject) => {
        const s = io(t.baseUrl, {
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
          extraHeaders: { cookie: user.cookie, origin: 'https://evil.example' },
        });
        s.once('connect', () => resolve(s));
        s.once('connect_error', (e) => reject(e));
      }),
    ).rejects.toThrow();
  });

  it('refuses room channel access to non-members', async () => {
    const { roomId } = await setup();
    const outsider = await registerUser(t);
    const socket = await connectSocket(t, outsider.cookie);
    sockets.push(socket);
    const ack = await emitAck<Ack>(socket, SocketEvents.ROOM_JOIN, { roomId });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  });

  it('answers clock pings with server time', async () => {
    const user = await registerUser(t);
    const socket = await connectSocket(t, user.cookie);
    sockets.push(socket);
    const before = Date.now();
    const pong = await emitAck<{ clientSentAt: number; serverTime: number }>(
      socket,
      SocketEvents.CLOCK_PING,
      { clientSentAt: before },
    );
    expect(pong.clientSentAt).toBe(before);
    expect(Math.abs(pong.serverTime - Date.now())).toBeLessThan(1000);
  });

  it('synchronizes play, pause and seek from host to viewers', async () => {
    const { host, viewer, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    expect(v.snapshot.you).toMatchObject({ role: 'MEMBER', canControl: false });
    expect(h.snapshot.you.canControl).toBe(true);
    let version = h.snapshot.playback.version;

    const playSeen = nextEvent<{ state: PlaybackState }>(v.socket, SocketEvents.PLAYBACK_SYNC);
    const play = await emitAck<Ack>(h.socket, SocketEvents.PLAYBACK_PLAY, cmd(roomId, version));
    expect(play.ok).toBe(true);
    const synced = await playSeen;
    expect(synced.state).toMatchObject({ status: 'playing', version: version + 1 });
    version += 1;

    await sleep(300);
    const pauseSeen = nextEvent<{ state: PlaybackState }>(v.socket, SocketEvents.PLAYBACK_SYNC);
    await emitAck<Ack>(h.socket, SocketEvents.PLAYBACK_PAUSE, cmd(roomId, version));
    const paused = (await pauseSeen).state;
    expect(paused.status).toBe('paused');
    expect(paused.positionSec).toBeGreaterThan(0.2);
    expect(paused.positionSec).toBeLessThan(1.5);
    version += 1;

    const seekSeen = nextEvent<{ state: PlaybackState }>(v.socket, SocketEvents.PLAYBACK_SYNC);
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_SEEK,
      cmd(roomId, version, { positionSec: 42 }),
    );
    expect((await seekSeen).state).toMatchObject({ positionSec: 42, status: 'paused' });
  });

  it('rejects playback commands from members without control', async () => {
    const { host, viewer, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    const ack = await emitAck<Ack>(
      v.socket,
      SocketEvents.PLAYBACK_PLAY,
      cmd(roomId, h.snapshot.playback.version),
    );
    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const state = await host.agent.get(`/api/v1/rooms/${roomId}/playback-state`).expect(200);
    expect(state.body.state.status).toBe('paused');
    expect(state.body.state.version).toBe(h.snapshot.playback.version);
  });

  it('lets everyone control when the room policy is EVERYONE', async () => {
    const { host, viewer, roomId } = await setup({ controlPolicy: 'EVERYONE' });
    await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    expect(v.snapshot.you.canControl).toBe(true);
    const ack = await emitAck<Ack>(
      v.socket,
      SocketEvents.PLAYBACK_PLAY,
      cmd(roomId, v.snapshot.playback.version),
    );
    expect(ack.ok).toBe(true);
  });

  it('rejects stale commands and returns the current state', async () => {
    const { host, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    const v0 = h.snapshot.playback.version;
    await emitAck<Ack>(h.socket, SocketEvents.PLAYBACK_PLAY, cmd(roomId, v0));
    const stale = await emitAck<Ack>(h.socket, SocketEvents.PLAYBACK_PAUSE, cmd(roomId, v0));
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE' } });
    if (!stale.ok) expect(stale.state?.version).toBe(v0 + 1);
  });

  it('processes a replayed command id only once (idempotency)', async () => {
    const { host, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    const command = cmd(roomId, h.snapshot.playback.version);
    const first = await emitAck<Ack>(h.socket, SocketEvents.PLAYBACK_PLAY, command);
    const second = await emitAck<Ack>(h.socket, SocketEvents.PLAYBACK_PLAY, command);
    expect(first.ok && first.data.version).toBe(h.snapshot.playback.version + 1);
    expect(second).toMatchObject({ ok: true, duplicate: true });
    if (second.ok) expect(second.data.version).toBe(h.snapshot.playback.version + 1);
  });

  it('lets exactly one of two concurrent commands win', async () => {
    const { host, viewer, roomId } = await setup();
    await host.agent
      .patch(`/api/v1/rooms/${roomId}/members/${viewer.id}`)
      .send({ role: 'COHOST' })
      .expect(204);
    const h = await joinSocket(host, roomId);
    const c = await joinSocket(viewer, roomId);
    const base = h.snapshot.playback.version;
    const results = await Promise.all([
      emitAck<Ack>(h.socket, SocketEvents.PLAYBACK_SEEK, cmd(roomId, base, { positionSec: 10 })),
      emitAck<Ack>(c.socket, SocketEvents.PLAYBACK_SEEK, cmd(roomId, base, { positionSec: 99 })),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'STALE')).toHaveLength(1);
    const final = await host.agent.get(`/api/v1/rooms/${roomId}/playback-state`).expect(200);
    expect(final.body.state.version).toBe(base + 1);
  });

  it('gives late joiners a snapshot from which the live position can be reconstructed', async () => {
    const { host, viewer, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_SEEK,
      cmd(roomId, h.snapshot.playback.version, { positionSec: 30 }),
    );
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_PLAY,
      cmd(roomId, h.snapshot.playback.version + 1),
    );
    await sleep(700);
    const v = await joinSocket(viewer, roomId);
    const expected = expectedPosition(v.snapshot.playback, v.snapshot.serverTime);
    expect(expected).toBeGreaterThan(30.5);
    expect(expected).toBeLessThan(32);
    expect(v.snapshot.members.find((m) => m.userId === host.id)?.online).toBe(true);
  });

  it('restores state after a disconnect/reconnect', async () => {
    const { host, viewer, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_PLAY,
      cmd(roomId, h.snapshot.playback.version),
    );
    v.socket.disconnect();
    await sleep(400);
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_SEEK,
      cmd(roomId, h.snapshot.playback.version + 1, { positionSec: 200 }),
    );
    const again = await joinSocket(viewer, roomId);
    expect(again.snapshot.playback.version).toBe(h.snapshot.playback.version + 2);
    const pos = expectedPosition(again.snapshot.playback, again.snapshot.serverTime);
    expect(pos).toBeGreaterThanOrEqual(200);
    expect(pos).toBeLessThan(201.5);
  });

  it('restores playback state from Postgres when Redis loses it', async () => {
    const { host, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_SEEK,
      cmd(roomId, h.snapshot.playback.version, { positionSec: 77 }),
    );
    await t.redis.del(`pb:${roomId}`);
    const state = await host.agent.get(`/api/v1/rooms/${roomId}/playback-state`).expect(200);
    expect(state.body.state).toMatchObject({
      positionSec: 77,
      version: h.snapshot.playback.version + 1,
    });
  });

  it('detects the end of a movie on the server', async () => {
    const { host, viewer, roomId } = await setup({ durationSec: 2 });
    const h = await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    // An early client end-report is rejected.
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_PLAY,
      cmd(roomId, h.snapshot.playback.version),
    );
    const early = await emitAck<Ack>(v.socket, SocketEvents.MOVIE_END, {
      roomId,
      version: h.snapshot.playback.version + 1,
      positionSec: 2,
    });
    expect(early).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    const ended = await nextEvent<{ state: PlaybackState }>(
      v.socket,
      SocketEvents.PLAYBACK_SYNC,
      6000,
      (p) => p.state.status === 'ended',
    );
    expect(ended.state.positionSec).toBe(2);
  });

  it('records heartbeat drift samples and presence', async () => {
    const { host, viewer, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_PLAY,
      cmd(roomId, h.snapshot.playback.version),
    );
    const presence = nextEvent<{ members: Array<{ userId: string; buffering: boolean }> }>(
      h.socket,
      SocketEvents.MEMBER_PRESENCE,
      3000,
      (p) => p.members.some((m) => m.userId === viewer.id && m.buffering),
    );
    const hb = await emitAck<CommandAck<{ version: number }>>(
      v.socket,
      SocketEvents.PLAYBACK_HEARTBEAT,
      {
        roomId,
        version: h.snapshot.playback.version + 1,
        positionSec: 1,
        driftSec: 0.04,
        buffering: true,
      },
    );
    expect(hb.ok).toBe(true);
    await presence;
    await emitAck(v.socket, SocketEvents.PLAYBACK_HEARTBEAT, {
      roomId,
      version: h.snapshot.playback.version + 1,
      positionSec: 1,
      driftSec: -0.03,
      buffering: false,
    });
    const samples = await t.redis.lrange('sync:drift:samples', 0, -1);
    expect(samples).toContain('30');
  });

  it('transfers host to an online co-host after the host disconnects past the grace period', async () => {
    const { host, viewer, roomId } = await setup();
    await host.agent
      .patch(`/api/v1/rooms/${roomId}/members/${viewer.id}`)
      .send({ role: 'COHOST' })
      .expect(204);
    const h = await joinSocket(host, roomId);
    const c = await joinSocket(viewer, roomId);
    const transfer = nextEvent<{ toUserId: string; reason: string }>(
      c.socket,
      SocketEvents.HOST_TRANSFER,
      8000,
    );
    h.socket.disconnect();
    const evt = await transfer;
    expect(evt).toMatchObject({ toUserId: viewer.id, reason: 'disconnected' });
    await waitFor(
      () => t.prisma.room.findUniqueOrThrow({ where: { id: roomId } }),
      (r) => r.hostId === viewer.id,
    );
  });

  it('keeps the host when they reconnect within the grace period', async () => {
    const { host, viewer, roomId } = await setup();
    await host.agent
      .patch(`/api/v1/rooms/${roomId}/members/${viewer.id}`)
      .send({ role: 'COHOST' })
      .expect(204);
    const h = await joinSocket(host, roomId);
    await joinSocket(viewer, roomId);
    h.socket.disconnect();
    await sleep(200);
    await joinSocket(host, roomId);
    await sleep(1800);
    expect((await t.prisma.room.findUniqueOrThrow({ where: { id: roomId } })).hostId).toBe(host.id);
  });

  it('evicts kicked members from the room channel', async () => {
    const { host, viewer, roomId } = await setup();
    const h = await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    const kicked = nextEvent(v.socket, SocketEvents.MEMBER_KICKED);
    await host.agent.delete(`/api/v1/rooms/${roomId}/members/${viewer.id}`).expect(204);
    await kicked;
    let leaked = false;
    v.socket.on(SocketEvents.PLAYBACK_SYNC, () => (leaked = true));
    await emitAck(h.socket, SocketEvents.PLAYBACK_PLAY, cmd(roomId, h.snapshot.playback.version));
    await sleep(300);
    expect(leaked).toBe(false);
  });

  it('serves signed sources only to members and records room viewing in history', async () => {
    const { host, viewer, roomId, movie } = await setup();
    const outsider = await registerUser(t);
    await outsider.agent.get(`/api/v1/rooms/${roomId}/playback-sources`).expect(403);
    const res = await viewer.agent.get(`/api/v1/rooms/${roomId}/playback-sources`).expect(200);
    expect(res.body.movieId).toBe(movie.id);
    expect(res.body.sources[0].url).toMatch(/^\/api\/v1\/media\/[0-9a-f-]{36}\/\d+\/[\w-]+\//);

    const h = await joinSocket(host, roomId);
    const v = await joinSocket(viewer, roomId);
    await emitAck<Ack>(
      h.socket,
      SocketEvents.PLAYBACK_PLAY,
      cmd(roomId, h.snapshot.playback.version),
    );
    await emitAck(v.socket, SocketEvents.PLAYBACK_HEARTBEAT, {
      roomId,
      version: h.snapshot.playback.version + 1,
      positionSec: 42,
      driftSec: 0,
      buffering: false,
    });
    const history = await viewer.agent.get('/api/v1/history').expect(200);
    expect(history.body.items[0]).toMatchObject({ positionSec: 42 });
    expect(history.body.items[0].movie.id).toBe(movie.id);
  });
});
