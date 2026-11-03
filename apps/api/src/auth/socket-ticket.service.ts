import { Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { randomToken, sha256 } from '../common/crypto';
import { InjectRedis } from '../redis/redis.module';
import { SessionService } from './session.service';

export const SOCKET_TICKET_TTL_SEC = 60;

/** Single-use connection credentials for a frontend on a different hosting domain. */
@Injectable()
export class SocketTicketService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly sessions: SessionService,
  ) {}

  async issue(sessionId: string) {
    const ticket = randomToken();
    await this.redis.set(`socket-ticket:${sha256(ticket)}`, sessionId, 'EX', SOCKET_TICKET_TTL_SEC);
    return { ticket, expiresIn: SOCKET_TICKET_TTL_SEC };
  }

  async redeem(ticket: unknown) {
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;
    const sessionId = await this.redis.getdel(`socket-ticket:${sha256(ticket)}`);
    return sessionId ? this.sessions.resolveById(sessionId) : null;
  }
}
