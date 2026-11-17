import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SocketEvents } from '@jandi/shared';
import { useRoomChat } from './use-room-chat';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.api, errorMessage: () => 'error' }));
const msg = (id: string, time: number) => ({
  id,
  roomId: 'room',
  body: id,
  createdAt: new Date(time).toISOString(),
  deleted: false,
  kind: 'USER',
  author: { id: 'other', displayName: 'Someone', avatarUrl: null, isGuest: false },
  replyTo: null,
  reactions: [],
});
it('retains and orders live messages and deletions while reconnect history is in flight', async () => {
  const handlers = new Map<string, (message: never) => void>();
  const socket = {
    on: (event: string, fn: (message: never) => void) => handlers.set(event, fn),
    off: (event: string) => handlers.delete(event),
  };
  let resolveRefresh!: (value: unknown) => void;
  mocks.api
    .mockReset()
    .mockResolvedValueOnce({ items: [msg('one', 1000)], hasMore: false })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
  const { result, rerender } = renderHook(
    ({ version }) => useRoomChat('room', socket as never, 'me', null, version),
    { initialProps: { version: 0 } },
  );
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  rerender({ version: 1 });
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
  expect(result.current.loading).toBe(false);
  act(() => {
    handlers.get(SocketEvents.CHAT_DELETED)?.({ roomId: 'room', messageId: 'one' } as never);
    handlers.get(SocketEvents.CHAT_MESSAGE)?.(msg('three', 3000) as never);
    handlers.get(SocketEvents.CHAT_MESSAGE)?.(msg('two', 2000) as never);
  });
  await act(async () => {
    resolveRefresh({ items: [msg('one', 1000), msg('two', 2000)], hasMore: false });
  });
  expect(result.current.messages.map((m) => m.id)).toEqual(['one', 'two', 'three']);
  expect(result.current.messages[0]).toMatchObject({ deleted: true, body: '' });
});
