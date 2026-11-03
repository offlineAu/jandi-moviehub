import { clampRate, expectedPosition, type PlaybackState } from '@jandi/shared';

export type PlaybackAction =
  | { type: 'play'; positionSec?: number }
  | { type: 'pause'; positionSec?: number }
  | { type: 'seek'; positionSec: number }
  | { type: 'rate'; rate: number }
  | { type: 'load'; movieId: string; mediaAssetId: string; durationSec: number; autoplay: boolean }
  | { type: 'end' }
  | { type: 'unload' };

export type ReduceResult =
  { ok: true; state: PlaybackState } | { ok: false; code: 'NO_MEDIA' | 'INVALID'; message: string };

const clampPosition = (pos: number, duration: number | null) =>
  Math.max(0, duration != null ? Math.min(pos, duration) : pos);

export function initialPlayback(roomId: string, now: number): PlaybackState {
  return {
    roomId,
    version: 0,
    movieId: null,
    mediaAssetId: null,
    status: 'idle',
    positionSec: 0,
    rate: 1,
    anchorServerTime: now,
    durationSec: null,
    updatedBy: null,
    lastCommandId: null,
  };
}

/**
 * Pure state transition. The caller is responsible for authorization, version checks and
 * persistence; this function only computes the next authoritative state (version + 1).
 */
export function reducePlayback(
  state: PlaybackState,
  action: PlaybackAction,
  now: number,
  actor: string,
  commandId: string | null = null,
): ReduceResult {
  const next = (patch: Partial<PlaybackState>): ReduceResult => ({
    ok: true,
    state: {
      ...state,
      ...patch,
      version: state.version + 1,
      updatedBy: actor,
      lastCommandId: commandId,
    },
  });
  const current = expectedPosition(state, now);
  const hasMedia = !!state.mediaAssetId;

  switch (action.type) {
    case 'play': {
      if (!hasMedia) return { ok: false, code: 'NO_MEDIA', message: 'No movie is loaded' };
      let position = clampPosition(action.positionSec ?? current, state.durationSec);
      // Restart from the beginning when pressing play on a finished movie.
      if (state.durationSec != null && position >= state.durationSec - 0.25) position = 0;
      return next({ status: 'playing', positionSec: position, anchorServerTime: now });
    }
    case 'pause': {
      if (!hasMedia) return { ok: false, code: 'NO_MEDIA', message: 'No movie is loaded' };
      return next({
        status: state.status === 'ended' ? 'ended' : 'paused',
        positionSec: clampPosition(action.positionSec ?? current, state.durationSec),
        anchorServerTime: now,
      });
    }
    case 'seek': {
      if (!hasMedia) return { ok: false, code: 'NO_MEDIA', message: 'No movie is loaded' };
      if (!Number.isFinite(action.positionSec))
        return { ok: false, code: 'INVALID', message: 'Invalid position' };
      const position = clampPosition(action.positionSec, state.durationSec);
      return next({
        status: state.status === 'ended' ? 'paused' : state.status,
        positionSec: position,
        anchorServerTime: now,
      });
    }
    case 'rate': {
      if (!Number.isFinite(action.rate))
        return { ok: false, code: 'INVALID', message: 'Invalid rate' };
      return next({ rate: clampRate(action.rate), positionSec: current, anchorServerTime: now });
    }
    case 'load':
      return next({
        movieId: action.movieId,
        mediaAssetId: action.mediaAssetId,
        durationSec: action.durationSec,
        status: action.autoplay ? 'playing' : 'paused',
        positionSec: 0,
        rate: 1,
        anchorServerTime: now,
      });
    case 'end':
      return next({
        status: 'ended',
        positionSec: state.durationSec ?? current,
        anchorServerTime: now,
      });
    case 'unload':
      return next({
        movieId: null,
        mediaAssetId: null,
        durationSec: null,
        status: 'idle',
        positionSec: 0,
        anchorServerTime: now,
      });
  }
}
