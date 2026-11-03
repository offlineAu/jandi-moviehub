import { createHmac, randomUUID } from 'node:crypto';

/** LiveKit tokens must be short-lived; we never issue one valid for more than 2 hours. */
export const LIVEKIT_MAX_TTL_SEC = 2 * 3600;
export const LIVEKIT_DEFAULT_TTL_SEC = 3600;

export interface LiveKitVideoGrant {
  room: string;
  roomJoin: true;
  canPublish: boolean;
  canSubscribe: boolean;
}

export interface LiveKitClaims {
  iss: string;
  sub: string;
  name: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  video: LiveKitVideoGrant;
}

export interface LiveKitTokenOptions {
  apiKey: string;
  apiSecret: string;
  /** Participant identity (our user id). */
  identity: string;
  /** Display name shown to other participants. */
  name: string;
  room: string;
  ttlSec?: number;
  /** Clock override (ms) for tests. */
  now?: number;
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/**
 * A LiveKit access token: an HS256 JWT signed with the API secret, `iss` = API key,
 * `sub` = participant identity and a `video` grant scoped to a single room.
 * Implemented with node:crypto so we take no SDK dependency.
 */
export function signLiveKitToken(opts: LiveKitTokenOptions): {
  token: string;
  claims: LiveKitClaims;
} {
  if (!opts.apiKey || !opts.apiSecret) throw new Error('LiveKit API key and secret are required');
  const ttl = Math.min(
    Math.max(Math.floor(opts.ttlSec ?? LIVEKIT_DEFAULT_TTL_SEC), 60),
    LIVEKIT_MAX_TTL_SEC,
  );
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const claims: LiveKitClaims = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name,
    jti: randomUUID(),
    iat,
    nbf: iat,
    exp: iat + ttl,
    video: { room: opts.room, roomJoin: true, canPublish: true, canSubscribe: true },
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac('sha256', opts.apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return { token: `${header}.${payload}.${signature}`, claims };
}
