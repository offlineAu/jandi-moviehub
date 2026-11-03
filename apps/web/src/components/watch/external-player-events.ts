/** A catalog listing is not playback: accept only an event from the active provider frame. */
export function isExternalPlaybackEvent(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  frame: Window | null,
): boolean {
  if (!frame || event.origin !== 'https://vidsrc.sh' || event.source !== frame) return false;
  const data: unknown = event.data;
  if (!data || typeof data !== 'object' || !('type' in data) || !('data' in data)) return false;
  const payload = data.data;
  return (
    data.type === 'PLAYER_EVENT' &&
    !!payload &&
    typeof payload === 'object' &&
    'player_status' in payload &&
    payload.player_status === 'playing'
  );
}
