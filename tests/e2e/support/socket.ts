import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Cookie } from '@playwright/test';
import { API, ORIGIN } from './api';

// socket.io-client is a dependency of the web app; borrow it (no extra install for the suite).
const requireFromWeb = createRequire(resolve(__dirname, '../../../apps/web/package.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { io } = requireFromWeb('socket.io-client') as typeof import('socket.io-client');

export type Ack =
  { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };

/**
 * A raw Socket.IO connection authenticated with someone's session cookies — exactly what a
 * tampered client could send, bypassing every UI guard.
 */
export async function rawSocket(cookies: Cookie[]) {
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const socket = io(API, {
    transports: ['websocket'],
    extraHeaders: { cookie, origin: ORIGIN },
    reconnection: false,
    forceNew: true,
  });
  await new Promise<void>((ok, fail) => {
    socket.once('connect', () => ok());
    socket.once('connect_error', (e: Error) => fail(e));
  });
  return {
    emit: (event: string, payload: unknown) =>
      socket.timeout(5000).emitWithAck(event, payload) as Promise<Ack>,
    close: () => socket.disconnect(),
  };
}
