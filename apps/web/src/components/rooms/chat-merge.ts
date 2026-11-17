import type { ChatMessageDto } from '@jandi/shared';

export type ChatItem = ChatMessageDto & { pending?: boolean; failed?: boolean };

const isUnsent = (m: ChatItem) => !!(m.pending || m.failed);
const time = (m: ChatItem) => Date.parse(m.createdAt) || 0;

/**
 * Merges a freshly fetched history page into what is already on screen (initial load,
 * reconnect refresh, or an older page).
 *
 * - Confirmed messages are de-duplicated by `id`; the fetched copy wins (latest deletion and
 *   reaction state) but keeps a known `clientId` so in-flight acks still reconcile.
 * - Confirmed messages are ordered by server `createdAt` (stable for equal timestamps), so an
 *   older message can never end up below a newer one.
 * - Unsent (pending/failed) optimistic items stay at the end in their existing order; their
 *   timestamps come from the client clock and are not comparable with server ones.
 */
export function mergeChatHistory(
  current: ChatItem[],
  fetched: ChatItem[],
  snapshot?: ReadonlyMap<string, ChatItem>,
): ChatItem[] {
  const byId = new Map<string, ChatItem>();
  for (const m of current) if (!isUnsent(m)) byId.set(m.id, m);
  for (const m of fetched) {
    const prev = byId.get(m.id);
    // A live deletion or reaction after this request started is newer than its snapshot.
    if (snapshot && prev && prev !== snapshot.get(m.id)) continue;
    byId.set(m.id, prev?.clientId && !m.clientId ? { ...m, clientId: prev.clientId } : m);
  }
  const confirmed = [...byId.values()]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => time(a.m) - time(b.m) || a.i - b.i)
    .map(({ m }) => m);
  const confirmedClientIds = new Set(confirmed.flatMap((m) => (m.clientId ? [m.clientId] : [])));
  const unsent = current.filter(
    (m) => isUnsent(m) && !(m.clientId && confirmedClientIds.has(m.clientId)),
  );
  return [...confirmed, ...unsent];
}
