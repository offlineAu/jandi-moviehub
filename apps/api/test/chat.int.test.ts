import {
  type ChatMessageDto,
  type CommandAck,
  type RoomSnapshot,
  SocketEvents,
} from '@jandi/shared';
import type { Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearRedis,
  connectSocket,
  createTestApp,
  emitAck,
  nextEvent,
  registerUser,
  resetState,
  type TestApp,
  type TestUser,
} from './helpers';

describe('chat and reactions (integration)', () => {
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

  async function setup() {
    const host = await registerUser(t);
    const fan = await registerUser(t);
    const res = await host.agent
      .post('/api/v1/rooms')
      .send({ name: 'Chatty', visibility: 'PUBLIC' })
      .expect(201);
    const roomId = res.body.room.id as string;
    await fan.agent.post(`/api/v1/rooms/${roomId}/join`).send({}).expect(200);
    const join = async (u: TestUser) => {
      const s = await connectSocket(t, u.cookie);
      sockets.push(s);
      const ack = await emitAck<CommandAck<RoomSnapshot>>(s, SocketEvents.ROOM_JOIN, { roomId });
      expect(ack.ok).toBe(true);
      return s;
    };
    return { host, fan, roomId, hs: await join(host), fs: await join(fan) };
  }

  it('broadcasts and persists messages; stores markup as inert text', async () => {
    const { roomId, hs, fs, fan } = await setup();
    const payload = '<img src=x onerror=alert(1)> <script>alert("x")</script>';
    const received = nextEvent<ChatMessageDto>(
      hs,
      SocketEvents.CHAT_MESSAGE,
      3000,
      (m) => m.kind === 'USER',
    );
    const ack = await emitAck<CommandAck<ChatMessageDto>>(fs, SocketEvents.CHAT_SEND, {
      roomId,
      body: payload,
      clientId: 'c-1',
    });
    expect(ack.ok).toBe(true);
    const msg = await received;
    expect(msg.body).toBe(payload); // rendered as text by the client, never as HTML
    expect(msg.author?.id).toBe(fan.id);
    expect(msg.clientId).toBe('c-1');
    const history = await fan.agent.get(`/api/v1/rooms/${roomId}/messages`).expect(200);
    expect(history.body.items.some((m: ChatMessageDto) => m.body === payload)).toBe(true);
    // Join notice was recorded as a system message.
    expect(
      history.body.items.some(
        (m: ChatMessageDto) => m.kind === 'SYSTEM' && m.body.includes('joined'),
      ),
    ).toBe(true);
  });

  it('supports replies and reaction toggles', async () => {
    const { roomId, hs, fs } = await setup();
    const first = await emitAck<CommandAck<ChatMessageDto>>(hs, SocketEvents.CHAT_SEND, {
      roomId,
      body: 'Ready?',
    });
    if (!first.ok) throw new Error('send failed');
    const reply = await emitAck<CommandAck<ChatMessageDto>>(fs, SocketEvents.CHAT_SEND, {
      roomId,
      body: 'Yes!',
      replyToId: first.data.id,
    });
    expect(reply.ok && reply.data.replyTo?.body).toBe('Ready?');

    const reacted = nextEvent<{ count: number; added: boolean }>(hs, SocketEvents.CHAT_REACTIONS);
    await emitAck(fs, SocketEvents.CHAT_REACT, { roomId, messageId: first.data.id, emoji: '🍿' });
    expect(await reacted).toMatchObject({ count: 1, added: true });
    const toggled = await emitAck<CommandAck<{ count: number; added: boolean }>>(
      fs,
      SocketEvents.CHAT_REACT,
      { roomId, messageId: first.data.id, emoji: '🍿' },
    );
    expect(toggled.ok && toggled.data).toMatchObject({ count: 0, added: false });
    const bad = await emitAck<CommandAck>(fs, SocketEvents.CHAT_REACT, {
      roomId,
      messageId: first.data.id,
      emoji: '💩',
    });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID' } });
  });

  it('lets authors and hosts delete, but not other members', async () => {
    const { roomId, hs, fs } = await setup();
    const hostMsg = await emitAck<CommandAck<ChatMessageDto>>(hs, SocketEvents.CHAT_SEND, {
      roomId,
      body: 'host message',
    });
    const fanMsg = await emitAck<CommandAck<ChatMessageDto>>(fs, SocketEvents.CHAT_SEND, {
      roomId,
      body: 'spoiler!!',
    });
    if (!hostMsg.ok || !fanMsg.ok) throw new Error('send failed');
    const denied = await emitAck<CommandAck>(fs, SocketEvents.CHAT_DELETE, {
      messageId: hostMsg.data.id,
    });
    expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const deleted = nextEvent<{ messageId: string }>(fs, SocketEvents.CHAT_DELETED);
    const ok = await emitAck<CommandAck>(hs, SocketEvents.CHAT_DELETE, {
      messageId: fanMsg.data.id,
    });
    expect(ok.ok).toBe(true);
    expect((await deleted).messageId).toBe(fanMsg.data.id);
    const row = await t.prisma.message.findUniqueOrThrow({ where: { id: fanMsg.data.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.body).toBe('');
  });

  it('rate limits floods and blocks repeated spam', async () => {
    const { roomId, fs } = await setup();
    const results: Array<CommandAck<ChatMessageDto>> = [];
    for (let i = 0; i < 7; i++)
      results.push(await emitAck(fs, SocketEvents.CHAT_SEND, { roomId, body: `message ${i}` }));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });

    await clearRedis(t);
    const spam = [];
    for (let i = 0; i < 3; i++)
      spam.push(await emitAck<CommandAck>(fs, SocketEvents.CHAT_SEND, { roomId, body: 'BUY NOW' }));
    expect(spam[2]).toMatchObject({ ok: false, error: { code: 'INVALID' } });
  });

  it('rejects messages from non-members and empty bodies', async () => {
    const { roomId } = await setup();
    const outsider = await registerUser(t);
    const s = await connectSocket(t, outsider.cookie);
    sockets.push(s);
    const ack = await emitAck<CommandAck>(s, SocketEvents.CHAT_SEND, { roomId, body: 'let me in' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
    await outsider.agent.get(`/api/v1/rooms/${roomId}/messages`).expect(403);
  });

  it('relays floating reaction bursts', async () => {
    const { roomId, hs, fs } = await setup();
    const burst = nextEvent<{ emoji: string }>(hs, SocketEvents.REACTION_BURST);
    await emitAck(fs, SocketEvents.REACTION_BURST, { roomId, emoji: '😂' });
    expect((await burst).emoji).toBe('😂');
  });
});
