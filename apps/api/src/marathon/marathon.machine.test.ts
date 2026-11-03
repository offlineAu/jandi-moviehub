import { describe, expect, it } from 'vitest';
import { type MarathonModel, transition } from './marathon.machine';

const model = (patch: Partial<MarathonModel> = {}): MarathonModel => ({
  state: 'READY',
  currentIndex: 0,
  itemCount: 3,
  countdownSec: 10,
  intermissionSec: 30,
  ...patch,
});

describe('marathon state machine', () => {
  it('READY → COUNTDOWN → TRANSITIONING → PLAYING', () => {
    const a = transition(model(), { type: 'START' })!;
    expect(a).toMatchObject({ state: 'COUNTDOWN', phaseSec: 10, effect: 'NONE' });
    const b = transition(model({ state: 'COUNTDOWN' }), { type: 'COUNTDOWN_ELAPSED' })!;
    expect(b).toMatchObject({ state: 'TRANSITIONING', currentIndex: 0, effect: 'LOAD_CURRENT' });
    expect(transition(model({ state: 'TRANSITIONING' }), { type: 'MOVIE_LOADED' })).toMatchObject({
      state: 'PLAYING',
    });
  });

  it('skips the countdown when countdownSec is 0', () => {
    expect(transition(model({ countdownSec: 0 }), { type: 'START' })).toMatchObject({
      state: 'TRANSITIONING',
      effect: 'LOAD_CURRENT',
    });
  });

  it('PLAYING → INTERMISSION → next movie', () => {
    expect(transition(model({ state: 'PLAYING' }), { type: 'MOVIE_ENDED' })).toMatchObject({
      state: 'INTERMISSION',
      phaseSec: 30,
    });
    expect(
      transition(model({ state: 'INTERMISSION' }), { type: 'INTERMISSION_ELAPSED' }),
    ).toMatchObject({
      state: 'TRANSITIONING',
      currentIndex: 1,
    });
  });

  it('goes straight to the next movie without intermission', () => {
    expect(
      transition(model({ state: 'PLAYING', intermissionSec: 0 }), { type: 'MOVIE_ENDED' }),
    ).toMatchObject({
      state: 'TRANSITIONING',
      currentIndex: 1,
    });
  });

  it('completes after the last movie', () => {
    expect(
      transition(model({ state: 'PLAYING', currentIndex: 2 }), { type: 'MOVIE_ENDED' }),
    ).toMatchObject({ state: 'COMPLETED' });
  });

  it('treats duplicate or out-of-order events as no-ops (idempotency)', () => {
    expect(transition(model({ state: 'INTERMISSION' }), { type: 'MOVIE_ENDED' })).toBeNull();
    expect(transition(model({ state: 'PLAYING' }), { type: 'COUNTDOWN_ELAPSED' })).toBeNull();
    expect(transition(model({ state: 'PLAYING' }), { type: 'INTERMISSION_ELAPSED' })).toBeNull();
    expect(transition(model({ state: 'PLAYING' }), { type: 'MOVIE_LOADED' })).toBeNull();
    expect(transition(model({ state: 'IDLE' }), { type: 'STOP' })).toBeNull();
  });

  it('supports skip and previous', () => {
    expect(
      transition(model({ state: 'PLAYING', currentIndex: 1 }), { type: 'SKIP' }),
    ).toMatchObject({ currentIndex: 2, effect: 'LOAD_CURRENT' });
    expect(
      transition(model({ state: 'PLAYING', currentIndex: 2 }), { type: 'SKIP' }),
    ).toMatchObject({ state: 'COMPLETED' });
    expect(
      transition(model({ state: 'PLAYING', currentIndex: 1 }), { type: 'PREVIOUS' }),
    ).toMatchObject({ currentIndex: 0 });
    expect(
      transition(model({ state: 'PLAYING', currentIndex: 0 }), { type: 'PREVIOUS' }),
    ).toBeNull();
  });

  it('stops, resumes from the same index, and restarts after completion', () => {
    expect(
      transition(model({ state: 'PLAYING', currentIndex: 1 }), { type: 'STOP' }),
    ).toMatchObject({ state: 'IDLE', currentIndex: 1, effect: 'PAUSE_PLAYBACK' });
    expect(transition(model({ state: 'IDLE', currentIndex: 1 }), { type: 'START' })).toMatchObject({
      state: 'COUNTDOWN',
      currentIndex: 1,
    });
    expect(
      transition(model({ state: 'COMPLETED', currentIndex: 2 }), { type: 'START' }),
    ).toMatchObject({ currentIndex: 0 });
  });

  it('fails into ERROR and retries the current item', () => {
    expect(
      transition(model({ state: 'TRANSITIONING' }), { type: 'FAIL', error: 'boom' }),
    ).toMatchObject({ state: 'ERROR', error: 'boom' });
    expect(transition(model({ state: 'ERROR', currentIndex: 1 }), { type: 'RETRY' })).toMatchObject(
      { state: 'TRANSITIONING', currentIndex: 1 },
    );
  });

  it('refuses to start an empty marathon', () => {
    expect(transition(model({ itemCount: 0 }), { type: 'START' })).toBeNull();
  });
});
