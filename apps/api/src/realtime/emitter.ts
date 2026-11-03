import { Global, Injectable, Module } from '@nestjs/common';
import type { Server } from 'socket.io';

export const roomChannel = (roomId: string) => `room:${roomId}`;
export const userChannel = (userId: string) => `user:${userId}`;

/**
 * Thin handle to the Socket.IO server so domain services can broadcast without depending
 * on the gateway. With the Redis adapter, emits reach sockets on every API instance.
 */
@Injectable()
export class RealtimeEmitter {
  private server?: Server;

  attach(server: Server) {
    this.server = server;
  }

  get io(): Server | undefined {
    return this.server;
  }

  toRoom(roomId: string, event: string, payload: unknown) {
    this.server?.to(roomChannel(roomId)).emit(event, payload);
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(userChannel(userId)).emit(event, payload);
  }

  /** Socket ids/users currently connected to a room channel across all instances. */
  async roomSockets(roomId: string) {
    if (!this.server) return [];
    return this.server.in(roomChannel(roomId)).fetchSockets();
  }

  async userOnline(userId: string): Promise<boolean> {
    if (!this.server) return false;
    const sockets = await this.server.in(userChannel(userId)).fetchSockets();
    return sockets.length > 0;
  }

  /** Force a user's sockets out of a room channel (kick/ban/close). */
  async evictUser(roomId: string, userId: string) {
    if (!this.server) return;
    this.server.in(userChannel(userId)).socketsLeave(roomChannel(roomId));
  }
}

@Global()
@Module({ providers: [RealtimeEmitter], exports: [RealtimeEmitter] })
export class RealtimeEmitterModule {}
