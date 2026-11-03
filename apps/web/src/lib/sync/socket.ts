'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let refs = 0;

/** Origin of the realtime server (the API). Same origin as the page behind the reverse proxy. */
export const wsUrl = () => process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

/**
 * One shared, cookie-authenticated Socket.IO connection per tab. Callers `acquireSocket()` on
 * mount and `releaseSocket()` on unmount; the connection closes when nobody uses it.
 */
export function acquireSocket(): Socket {
  refs += 1;
  if (!socket) {
    socket = io(wsUrl(), {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function releaseSocket() {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Reconnect with fresh cookies after login/logout. */
export function resetSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
