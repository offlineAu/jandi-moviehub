import { describe, expect, it } from 'vitest';
import { initialPlayback, reducePlayback } from './playback.reducer';

const loaded = () => {
  const r = reducePlayback(
    initialPlayback('room', 0),
    { type: 'load', movieId: 'm', mediaAssetId: 'a', durationSec: 100, autoplay: false },
    0,
    'host',
  );
  if (!r.ok) throw new Error('load failed');
  return r.state;
};

describe('reducePlayback', () => {
  it('rejects transport commands without media', () => {
    const r = reducePlayback(initialPlayback('room', 0), { type: 'play' }, 0, 'u');
    expect(r).toMatchObject({ ok: false, code: 'NO_MEDIA' });
  });

  it('loads paused at zero and bumps the version', () => {
    const s = loaded();
    expect(s).toMatchObject({ status: 'paused', positionSec: 0, version: 1, durationSec: 100 });
  });

  it('play anchors the current position at server time', () => {
    const r = reducePlayback(loaded(), { type: 'play' }, 5_000, 'host', 'c1');
    expect(r.ok && r.state).toMatchObject({
      status: 'playing',
      positionSec: 0,
      anchorServerTime: 5_000,
      version: 2,
      lastCommandId: 'c1',
    });
  });

  it('pause captures the expected position when none is given', () => {
    const playing = reducePlayback(loaded(), { type: 'play' }, 0, 'h');
    if (!playing.ok) throw new Error();
    const paused = reducePlayback(playing.state, { type: 'pause' }, 12_500, 'h');
    expect(paused.ok && paused.state.positionSec).toBeCloseTo(12.5);
    expect(paused.ok && paused.state.status).toBe('paused');
  });

  it('seek clamps into [0, duration] and keeps status', () => {
    const r = reducePlayback(loaded(), { type: 'seek', positionSec: 500 }, 0, 'h');
    expect(r.ok && r.state).toMatchObject({ positionSec: 100, status: 'paused' });
    const neg = reducePlayback(loaded(), { type: 'seek', positionSec: -5 }, 0, 'h');
    expect(neg.ok && neg.state.positionSec).toBe(0);
  });

  it('rate re-anchors and clamps', () => {
    const playing = reducePlayback(loaded(), { type: 'play' }, 0, 'h');
    if (!playing.ok) throw new Error();
    const r = reducePlayback(playing.state, { type: 'rate', rate: 5 }, 10_000, 'h');
    expect(r.ok && r.state).toMatchObject({ rate: 2, positionSec: 10, anchorServerTime: 10_000 });
  });

  it('play after the end restarts from zero', () => {
    const ended = reducePlayback(loaded(), { type: 'end' }, 0, 'system');
    if (!ended.ok) throw new Error();
    const r = reducePlayback(ended.state, { type: 'play' }, 1_000, 'h');
    expect(r.ok && r.state.positionSec).toBe(0);
  });

  it('rejects non-finite input', () => {
    expect(
      reducePlayback(loaded(), { type: 'seek', positionSec: Number.NaN }, 0, 'h'),
    ).toMatchObject({ ok: false, code: 'INVALID' });
  });
});

it('shares a KissKH episode while rejecting unsupported synchronized transport commands', () => {
  const selected = reducePlayback(
    initialPlayback('room', 0),
    {
      type: 'load-tv',
      tvEpisode: {
        provider: 'kisskh',
        tvId: '71446',
        season: 1,
        episode: 1,
        numbering: 'provider',
        seriesId: 2510,
        episodeId: 57281,
      },
      durationSec: null,
      autoplay: false,
    },
    0,
    'host',
  );
  expect(selected).toMatchObject({ ok: true, state: { status: 'paused', durationSec: null } });
  if (!selected.ok) throw new Error('Selection failed');
  for (const action of [
    { type: 'play' },
    { type: 'pause' },
    { type: 'seek', positionSec: 120 },
    { type: 'rate', rate: 2 },
  ] as const)
    expect(reducePlayback(selected.state, action, 0, 'host')).toMatchObject({
      ok: false,
      code: 'INVALID',
    });
  const movie = reducePlayback(
    selected.state,
    { type: 'load', movieId: 'm', mediaAssetId: 'a', durationSec: 100, autoplay: false },
    0,
    'host',
  );
  expect(movie).toMatchObject({ ok: true, state: { tvEpisode: null } });
});

it('synchronizes external selections, learns duration and clears them on native loads', () => {
  const externalMedia = {
    provider: 'vidsrc' as const,
    type: 'tv' as const,
    tvId: 1399,
    tmdbId: 1399,
    season: 1,
    episode: 2,
  };
  const loaded = reducePlayback(
    initialPlayback('room', 0),
    { type: 'load-external', externalMedia },
    0,
    'host',
  );
  if (!loaded.ok) throw new Error('load');
  expect(loaded.state).toMatchObject({
    externalMedia,
    status: 'paused',
    durationSec: null,
    mediaAssetId: null,
    tvEpisode: null,
  });
  expect(reducePlayback(loaded.state, { type: 'rate', rate: 1.5 }, 0, 'host')).toMatchObject({
    ok: false,
    code: 'INVALID',
  });
  const metadata = reducePlayback(loaded.state, { type: 'duration', durationSec: 600 }, 0, 'host');
  if (!metadata.ok) throw new Error('metadata');
  const playing = reducePlayback(metadata.state, { type: 'play' }, 1000, 'host');
  if (!playing.ok) throw new Error('play');
  const paused = reducePlayback(playing.state, { type: 'pause' }, 5000, 'host');
  expect(paused.ok && paused.state).toMatchObject({
    positionSec: 4,
    status: 'paused',
    durationSec: 600,
  });
  const native = reducePlayback(
    playing.state,
    { type: 'load', movieId: 'm', mediaAssetId: 'a', durationSec: 100, autoplay: false },
    10000,
    'host',
  );
  expect(native.ok && native.state.externalMedia).toBeNull();
  const unloaded = reducePlayback(playing.state, { type: 'unload' }, 10000, 'host');
  expect(unloaded.ok && unloaded.state.externalMedia).toBeNull();
});

it('permits synchronized transport and learns duration for a direct KissKH episode', () => {
  const selected = reducePlayback(
    initialPlayback('room', 0),
    {
      type: 'load-tv',
      tvEpisode: {
        provider: 'kisskh-direct',
        tvId: '71446',
        season: 1,
        episode: 1,
        numbering: 'provider',
        seriesId: 2510,
        episodeId: 57281,
      },
      durationSec: null,
      autoplay: false,
    },
    0,
    'host',
  );
  if (!selected.ok) throw new Error('selection');
  const duration = reducePlayback(
    selected.state,
    { type: 'duration', durationSec: 1800 },
    0,
    'host',
  );
  if (!duration.ok) throw new Error('duration');
  const play = reducePlayback(duration.state, { type: 'play' }, 1000, 'host');
  if (!play.ok) throw new Error('play');
  const seek = reducePlayback(play.state, { type: 'seek', positionSec: 100 }, 2000, 'host');
  expect(seek).toMatchObject({
    ok: true,
    state: { status: 'playing', positionSec: 100, durationSec: 1800 },
  });
});
