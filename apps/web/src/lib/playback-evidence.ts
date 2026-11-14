const TTL_MS = 10 * 60_000;
const PREFIX = 'jandi:playback-evidence:';

/** Local, title-specific evidence; a failed title does not condemn a provider globally. */
export function rememberPlaybackOutcome(
  titleId: string,
  provider: string,
  outcome: 'started' | 'failed',
) {
  try {
    window.sessionStorage.setItem(
      `${PREFIX}${provider}:${titleId}`,
      JSON.stringify({ outcome, at: Date.now() }),
    );
  } catch {
    /* Playback must work when storage is disabled. */
  }
}

export function recentlyFailedPlayback(titleId: string, provider: string) {
  try {
    const raw = window.sessionStorage.getItem(`${PREFIX}${provider}:${titleId}`);
    if (!raw) return false;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('at' in value) || !('outcome' in value))
      return false;
    return (
      typeof value.at === 'number' &&
      Date.now() >= value.at &&
      Date.now() - value.at < TTL_MS &&
      value.outcome === 'failed'
    );
  } catch {
    return false;
  }
}
