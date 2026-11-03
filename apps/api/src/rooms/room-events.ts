import { Injectable } from '@nestjs/common';

export interface RoomEventListener {
  roomCreated(roomId: string, hostId: string, movieId: string | null): Promise<void>;
  roomUpdated(roomId: string): Promise<void>;
  roomClosed(roomId: string): Promise<void>;
  systemMessage(roomId: string, body: string): Promise<void>;
  presenceChanged(roomId: string): Promise<void>;
}

/**
 * Observer hub so room lifecycle events reach playback, chat, marathon and presence
 * without circular module dependencies. Listeners register themselves on module init.
 */
@Injectable()
export class RoomEvents {
  private readonly listeners: Array<Partial<RoomEventListener>> = [];

  register(listener: Partial<RoomEventListener>) {
    this.listeners.push(listener);
  }

  private async fire<K extends keyof RoomEventListener>(
    name: K,
    ...args: Parameters<RoomEventListener[K]>
  ) {
    for (const l of this.listeners) {
      const fn = l[name] as ((...a: Parameters<RoomEventListener[K]>) => Promise<void>) | undefined;
      if (fn) await fn.apply(l, args);
    }
  }

  roomCreated(roomId: string, hostId: string, movieId: string | null) {
    return this.fire('roomCreated', roomId, hostId, movieId);
  }
  roomUpdated(roomId: string) {
    return this.fire('roomUpdated', roomId);
  }
  roomClosed(roomId: string) {
    return this.fire('roomClosed', roomId);
  }
  systemMessage(roomId: string, body: string) {
    return this.fire('systemMessage', roomId, body);
  }
  presenceChanged(roomId: string) {
    return this.fire('presenceChanged', roomId);
  }
}
