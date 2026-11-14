import { expect, it } from 'vitest';
import { nextAnimeSource } from './anime-source-recovery';

it('only falls back to an untried source with the same edition and languages', () => {
  const base = { adapterId: 'a', edition: 'original', audioLanguage: 'ja', subtitleLanguage: 'en' };
  const sources = [
    { ...base, id: 'current' },
    { ...base, id: 'other-cut', edition: 'recut' },
    { ...base, id: 'dub', audioLanguage: 'en' },
    { ...base, id: 'no-subs', subtitleLanguage: null },
    { ...base, id: 'tried' },
    { ...base, id: 'match', adapterId: 'b' },
  ];
  expect(nextAnimeSource(sources, 'current', ['current', 'tried'])?.id).toBe('match');
  expect(nextAnimeSource(sources, 'current', ['current', 'tried', 'match'])).toBeUndefined();
  expect(nextAnimeSource(sources, 'missing', [])).toBeUndefined();
});
