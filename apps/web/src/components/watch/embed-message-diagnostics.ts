/** Development-only summary. Never include stream URLs, arbitrary payloads or tokens. */
export function describeEmbedMessage(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  frame: Window | null,
): string | null {
  let payload: unknown = event.data;
  if (typeof payload === 'string' && payload.length <= 10000) {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  const envelope =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const sameFrame = !!frame && event.source === frame;
  if (!sameFrame && event.origin !== 'https://vidsrc.sh' && envelope.type !== 'PLAYER_EVENT')
    return null;
  const data =
    envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : {};
  const info =
    data.player_info && typeof data.player_info === 'object'
      ? (data.player_info as Record<string, unknown>)
      : {};
  const scalar = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value)) return value;
    return value === null ? null : typeof value;
  };
  let origin = 'invalid';
  try {
    origin = new URL(event.origin).origin;
  } catch {
    /* Opaque/invalid origin. */
  }
  return JSON.stringify({
    origin,
    sameFrame,
    messageType: scalar(envelope.type),
    mediaType: scalar(info.mediaType),
    tmdb: scalar(info.tmdb),
    imdb: scalar(info.imdb),
    season: scalar(info.season),
    episode: scalar(info.episode),
    status: scalar(data.player_status),
    progressType: typeof data.player_progress,
    durationType: typeof data.player_duration,
  });
}
