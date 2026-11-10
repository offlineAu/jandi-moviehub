import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenChatTicker, FullscreenChatToggle, TICKER_MS } from './fullscreen-chat';
import type { ChatItem } from './use-room-chat';

const ME = 'user-me';

function msg(id: string, body: string, extra: Partial<ChatItem> = {}): ChatItem {
  return {
    id,
    roomId: 'room-1',
    body,
    createdAt: new Date().toISOString(),
    deleted: false,
    kind: 'USER',
    author: { id: 'user-other', displayName: 'Hana', avatarUrl: null, isGuest: false },
    replyTo: null,
    reactions: [],
    ...extra,
  } as ChatItem;
}

describe('FullscreenChatTicker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('floats only messages that arrive after it appears, then lets them expire', () => {
    const onOpen = vi.fn();
    const history = [msg('m1', 'old news')];
    const { rerender } = render(
      <FullscreenChatTicker messages={history} myUserId={ME} onOpen={onOpen} />,
    );
    expect(screen.queryByText('old news')).toBeNull();

    rerender(
      <FullscreenChatTicker
        messages={[...history, msg('m2', 'popcorn time')]}
        myUserId={ME}
        onOpen={onOpen}
      />,
    );
    const item = screen.getByRole('button', { name: /popcorn time/ });
    expect(item.textContent).toContain('Hana');

    fireEvent.click(item);
    expect(onOpen).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(TICKER_MS + 10));
    expect(screen.queryByText('popcorn time')).toBeNull();
  });

  it('expires each message on its own clock even when more keep arriving', () => {
    const a = msg('a', 'first');
    const b = msg('b', 'second');
    const { rerender } = render(
      <FullscreenChatTicker messages={[]} myUserId={ME} onOpen={vi.fn()} />,
    );
    rerender(<FullscreenChatTicker messages={[a]} myUserId={ME} onOpen={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TICKER_MS - 1000));
    rerender(<FullscreenChatTicker messages={[a, b]} myUserId={ME} onOpen={vi.fn()} />);
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText('first')).toBeNull();
    expect(screen.getByText('second')).toBeTruthy();
  });

  it('skips the viewer’s own, pending, deleted and system messages', () => {
    const { rerender } = render(
      <FullscreenChatTicker messages={[]} myUserId={ME} onOpen={vi.fn()} />,
    );
    rerender(
      <FullscreenChatTicker
        myUserId={ME}
        onOpen={vi.fn()}
        messages={[
          msg('own', 'my own', {
            author: { id: ME, displayName: 'Me', avatarUrl: null, isGuest: false },
          }),
          msg('pend', 'sending', { pending: true }),
          msg('del', 'gone', { deleted: true }),
          msg('sys', 'Vic joined the room', { kind: 'SYSTEM' } as Partial<ChatItem>),
        ]}
      />,
    );
    expect(screen.queryByRole('list', { name: 'New chat messages' })).toBeNull();
  });
});

describe('FullscreenChatToggle', () => {
  it('announces unread messages and opens the chat', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<FullscreenChatToggle unread={0} onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: 'Show chat' })).toBeTruthy();
    rerender(<FullscreenChatToggle unread={3} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show chat, 3 unread messages' }));
    expect(onOpen).toHaveBeenCalled();
  });
});
