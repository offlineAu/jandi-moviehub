import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';
import { RoomsService } from '../rooms/rooms.service';
import { LIVEKIT_DEFAULT_TTL_SEC, signLiveKitToken } from './livekit-token';

/**
 * Voice chat is delegated to a LiveKit server. This service only mints access tokens;
 * without LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET voice is unavailable.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly config: AppConfig,
    private readonly rooms: RoomsService,
  ) {}

  private get credentials() {
    const {
      LIVEKIT_URL: url,
      LIVEKIT_API_KEY: apiKey,
      LIVEKIT_API_SECRET: apiSecret,
    } = this.config.env;
    return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
  }

  get configured(): boolean {
    return this.credentials !== null;
  }

  async issueToken(user: AuthUser, roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    const creds = this.credentials;
    if (!creds) {
      throw Errors.unavailable(
        'VOICE_NOT_CONFIGURED',
        'Voice chat is not configured on this server',
      );
    }
    const { token, claims } = signLiveKitToken({
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      identity: user.id,
      name: user.displayName,
      room: roomId,
      ttlSec: LIVEKIT_DEFAULT_TTL_SEC,
    });
    return { url: creds.url, token, expiresAt: new Date(claims.exp * 1000).toISOString() };
  }
}
