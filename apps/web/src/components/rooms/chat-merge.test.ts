import { describe, expect, it } from 'vitest';
import { mergeChatHistory, type ChatItem } from './chat-merge';

const base = Date.parse('2026-11-17T12:00:00.000Z');
const msg = (n: number, extra: Partial<ChatItem> = {}): ChatItem => ({
  id: `m${n}`,
  roomId: 'room',
  body: `message ${n}`,
  createdAt: new Date(base + n * 1000).toISOString(),
  deleted: false,
  kind: 'USER',
  author: null,
  replyTo: null,
  reactions: [],
  ...extra,
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));
const ids = (list: ChatItem[]) => list.map((m) => m.id);

describe('mergeChatHistory', () => {
  it('keeps chronological order when a reconnect refetches only the newest page', () => {
    // On screen: m11..m60 from the initial load plus m61..m65 that arrived live.
    const current = [...range(11, 60), ...range(61, 65)];
    // Reconnect refresh returns the newest 50: m16..m65.
    const merged = mergeChatHistory(current, range(16, 65));
    expect(ids(merged)).toEqual(ids(range(11, 65)));
  });

  it('keeps previously loaded older pages above newer messages on refresh', () => {
    const current = range(1, 60); // user scrolled up and loaded older pages
    const merged = mergeChatHistory(current, range(21, 70));
    expect(ids(merged)).toEqual(ids(range(1, 70)));
  });

  it('prepends an older page in order', () => {
    const merged = mergeChatHistory(range(51, 100), range(1, 50));
    expect(ids(merged)).toEqual(ids(range(1, 100)));
  });

  it('keeps live messages that arrived while history was loading', () => {
    const merged = mergeChatHistory([msg(70)], range(20, 69));
    expect(ids(merged)).toEqual(ids(range(20, 70)));
  });

  it('prefers the fetched copy (deletions, reactions) but keeps the known clientId', () => {
    const current = [msg(1), msg(2, { clientId: 'c2' })];
    const fetched = [msg(1), msg(2, { deleted: true, body: '' })];
    const merged = mergeChatHistory(current, fetched);
    expect(merged[1]).toMatchObject({ id: 'm2', deleted: true, body: '', clientId: 'c2' });
  });

  it('keeps unsent optimistic and failed items at the end, regardless of client clock', () => {
    const pending = msg(0, { id: 'pending-a', clientId: 'a', pending: true }); // skewed clock
    const failed = msg(0, { id: 'pending-b', clientId: 'b', failed: true });
    const merged = mergeChatHistory([msg(1), pending, failed], range(1, 3));
    expect(ids(merged)).toEqual(['m1', 'm2', 'm3', 'pending-a', 'pending-b']);
  });

  it('drops an optimistic item once its confirmed copy is present', () => {
    const pending = msg(5, { id: 'pending-a', clientId: 'a', pending: true });
    const confirmed = msg(5, { clientId: 'a' });
    const merged = mergeChatHistory([msg(4), confirmed, pending], [msg(4)]);
    expect(ids(merged)).toEqual(['m4', 'm5']);
  });

  it('is stable for identical timestamps', () => {
    const a = msg(1, { id: 'a' });
    const b = msg(1, { id: 'b' });
    expect(ids(mergeChatHistory([a, b], [a, b]))).toEqual(['a', 'b']);
  });
});
