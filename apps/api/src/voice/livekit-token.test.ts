import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../common/auth-context';
import type { AppConfig } from '../config/app-config';
import type { RoomsService } from '../rooms/rooms.service';
import { LIVEKIT_MAX_TTL_SEC, signLiveKitToken } from './livekit-token';
import { VoiceService } from './voice.service';

/** Independent HS256 verifier (does not reuse the signing code). */
function verify(
  token: string,
  secret: string,
): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const actual = Buffer.from(s, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>,
  };
}

const SECRET = 'lk-secret-for-unit-tests-0123456789abcdef';

describe('signLiveKitToken', () => {
  it('produces an HS256 JWT with LiveKit claims that verifies with the API secret', () => {
    const now = Date.UTC(2026, 9, 31, 12, 0, 0);
    const { token } = signLiveKitToken({
      apiKey: 'APIkey123',
      apiSecret: SECRET,
      identity: 'user-1',
      name: 'Ada',
      room: 'room-uuid',
      ttlSec: 1800,
      now,
    });
    const decoded = verify(token, SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    const nowSec = now / 1000;
    expect(decoded!.payload).toMatchObject({
      iss: 'APIkey123',
      sub: 'user-1',
      name: 'Ada',
      nbf: nowSec,
      iat: nowSec,
      exp: nowSec + 1800,
      video: { room: 'room-uuid', roomJoin: true, canPublish: true, canSubscribe: true },
    });
    expect(typeof decoded!.payload.jti).toBe('string');
  });

  it('rejects verification with the wrong secret or a tampered payload', () => {
    const { token } = signLiveKitToken({
      apiKey: 'k',
      apiSecret: SECRET,
      identity: 'u',
      name: 'n',
      room: 'r',
    });
    expect(verify(token, 'another-secret')).toBeNull();
    const [h, , s] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'admin', video: { room: '*', roomJoin: true } }),
    ).toString('base64url');
    expect(verify(`${h}.${forged}.${s}`, SECRET)).toBeNull();
  });

  it('caps the lifetime at 2 hours', () => {
    const { claims } = signLiveKitToken({
      apiKey: 'k',
      apiSecret: SECRET,
      identity: 'u',
      name: 'n',
      room: 'r',
      ttlSec: 86_400,
    });
    expect(claims.exp - claims.nbf).toBe(LIVEKIT_MAX_TTL_SEC);
  });

  it('refuses to sign without credentials', () => {
    expect(() =>
      signLiveKitToken({ apiKey: '', apiSecret: SECRET, identity: 'u', name: 'n', room: 'r' }),
    ).toThrow();
  });
});

describe('VoiceService', () => {
  const user = { id: 'u-1', displayName: 'Ada' } as AuthUser;
  const rooms = { requireMember: async () => ({}) } as unknown as RoomsService;
  const config = (env: Record<string, string | undefined>) => ({ env }) as unknown as AppConfig;

  it('is unconfigured and returns 503 VOICE_NOT_CONFIGURED without LiveKit credentials', async () => {
    const svc = new VoiceService(
      config({ LIVEKIT_URL: 'wss://lk.example', LIVEKIT_API_KEY: 'k' }),
      rooms,
    );
    expect(svc.configured).toBe(false);
    await expect(svc.issueToken(user, 'room-1')).rejects.toMatchObject({
      status: 503,
      code: 'VOICE_NOT_CONFIGURED',
    });
  });

  it('issues a verifiable room-scoped token when configured', async () => {
    const svc = new VoiceService(
      config({
        LIVEKIT_URL: 'wss://lk.example',
        LIVEKIT_API_KEY: 'APIk',
        LIVEKIT_API_SECRET: SECRET,
      }),
      rooms,
    );
    expect(svc.configured).toBe(true);
    const res = await svc.issueToken(user, 'room-1');
    expect(res.url).toBe('wss://lk.example');
    const decoded = verify(res.token, SECRET);
    expect(decoded?.payload).toMatchObject({
      iss: 'APIk',
      sub: 'u-1',
      name: 'Ada',
      video: { room: 'room-1', roomJoin: true },
    });
    const p = decoded!.payload as { exp: number; nbf: number };
    expect(p.exp - p.nbf).toBeLessThanOrEqual(LIVEKIT_MAX_TTL_SEC);
  });

  it('checks room membership before anything else', async () => {
    const denied = {
      requireMember: async () => Promise.reject(new Error('NOT_IN_ROOM')),
    } as unknown as RoomsService;
    const svc = new VoiceService(config({}), denied);
    await expect(svc.issueToken(user, 'room-1')).rejects.toThrow('NOT_IN_ROOM');
  });
});
