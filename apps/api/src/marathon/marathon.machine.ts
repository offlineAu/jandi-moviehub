import type { MarathonStateName } from '@jandi/shared';

export interface MarathonModel {
  state: MarathonStateName;
  currentIndex: number;
  itemCount: number;
  countdownSec: number;
  intermissionSec: number;
}

export type MarathonEvent =
  | { type: 'START' }
  | { type: 'COUNTDOWN_ELAPSED' }
  | { type: 'MOVIE_LOADED' }
  | { type: 'MOVIE_ENDED' }
  | { type: 'INTERMISSION_ELAPSED' }
  | { type: 'SKIP' }
  | { type: 'PREVIOUS' }
  | { type: 'STOP' }
  | { type: 'FAIL'; error: string }
  | { type: 'RETRY' };

/** Side effect the service must perform after persisting the transition. */
export type MarathonEffect = 'LOAD_CURRENT' | 'PAUSE_PLAYBACK' | 'NONE';

export interface MarathonTransition {
  state: MarathonStateName;
  currentIndex: number;
  /** Seconds until the timed phase ends (COUNTDOWN / INTERMISSION), else null. */
  phaseSec: number | null;
  effect: MarathonEffect;
  error?: string | null;
}

const ACTIVE: MarathonStateName[] = ['COUNTDOWN', 'PLAYING', 'INTERMISSION', 'TRANSITIONING'];

export const isActiveState = (s: MarathonStateName) => ACTIVE.includes(s);

/**
 * Pure marathon state machine. Returns null for events that are invalid in the current
 * state, which is what makes duplicate timers/clicks harmless (idempotent no-ops).
 */
export function transition(m: MarathonModel, event: MarathonEvent): MarathonTransition | null {
  const hasNext = m.currentIndex + 1 < m.itemCount;
  const load = (index: number): MarathonTransition => ({
    state: 'TRANSITIONING',
    currentIndex: index,
    phaseSec: null,
    effect: 'LOAD_CURRENT',
    error: null,
  });
  const startFrom = (index: number): MarathonTransition =>
    m.countdownSec > 0
      ? {
          state: 'COUNTDOWN',
          currentIndex: index,
          phaseSec: m.countdownSec,
          effect: 'NONE',
          error: null,
        }
      : load(index);

  if (m.itemCount === 0 && event.type !== 'STOP' && event.type !== 'FAIL') return null;

  switch (event.type) {
    case 'START':
      if (m.state === 'READY' || m.state === 'IDLE')
        return startFrom(Math.min(m.currentIndex, m.itemCount - 1));
      if (m.state === 'COMPLETED') return startFrom(0);
      return null;
    case 'COUNTDOWN_ELAPSED':
      return m.state === 'COUNTDOWN' ? load(m.currentIndex) : null;
    case 'MOVIE_LOADED':
      return m.state === 'TRANSITIONING'
        ? { state: 'PLAYING', currentIndex: m.currentIndex, phaseSec: null, effect: 'NONE' }
        : null;
    case 'MOVIE_ENDED':
      if (m.state !== 'PLAYING') return null;
      if (!hasNext)
        return { state: 'COMPLETED', currentIndex: m.currentIndex, phaseSec: null, effect: 'NONE' };
      if (m.intermissionSec > 0) {
        return {
          state: 'INTERMISSION',
          currentIndex: m.currentIndex,
          phaseSec: m.intermissionSec,
          effect: 'NONE',
        };
      }
      return load(m.currentIndex + 1);
    case 'INTERMISSION_ELAPSED':
      return m.state === 'INTERMISSION' && hasNext ? load(m.currentIndex + 1) : null;
    case 'SKIP':
      if (m.state === 'COUNTDOWN') return load(m.currentIndex);
      if (m.state !== 'PLAYING' && m.state !== 'INTERMISSION') return null;
      return hasNext
        ? load(m.currentIndex + 1)
        : {
            state: 'COMPLETED',
            currentIndex: m.currentIndex,
            phaseSec: null,
            effect: 'PAUSE_PLAYBACK',
          };
    case 'PREVIOUS':
      if ((m.state !== 'PLAYING' && m.state !== 'INTERMISSION') || m.currentIndex === 0)
        return null;
      return load(m.currentIndex - 1);
    case 'STOP':
      return m.state === 'IDLE'
        ? null
        : { state: 'IDLE', currentIndex: m.currentIndex, phaseSec: null, effect: 'PAUSE_PLAYBACK' };
    case 'FAIL':
      return {
        state: 'ERROR',
        currentIndex: m.currentIndex,
        phaseSec: null,
        effect: 'PAUSE_PLAYBACK',
        error: event.error,
      };
    case 'RETRY':
      return m.state === 'ERROR' ? load(m.currentIndex) : null;
  }
}
