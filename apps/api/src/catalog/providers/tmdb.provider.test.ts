import { describe, expect, it } from 'vitest';
import { details } from './__fixtures__/tmdb';
import { mapDetails, mapListItem, mapTrailers, parseReleaseDate } from './tmdb.mapper';
import { buildListRequest, tmdbPageWindow } from './tmdb.provider';

const q = (o: Record<string, unknown> = {}) => ({ page: 1, pageSize: 20, ...o }) as never;
const now = new Date('2026-10-31T12:00:00Z');

describe('buildListRequest', () => {
  it('routes plain categories to curated TMDB lists', () => {
    expect(buildListRequest(q({ category: 'trending' }), undefined, now).path).toBe(
      '/trending/movie/day',
    );
    expect(buildListRequest(q({ category: 'popular' }), undefined, now).path).toBe(
      '/movie/popular',
    );
    expect(buildListRequest(q({ category: 'recent' }), undefined, now).path).toBe(
      '/movie/now_playing',
    );
    expect(buildListRequest(q({ category: 'upcoming' }), undefined, now).path).toBe(
      '/movie/upcoming',
    );
    expect(buildListRequest(q({ category: 'top-rated' }), undefined, now).path).toBe(
      '/movie/top_rated',
    );
    expect(buildListRequest(q(), undefined, now).path).toBe('/movie/popular');
  });

  it('uses search for free text', () => {
    const r = buildListRequest(q({ q: 'alien', year: 1979 }), undefined, now);
    expect(r.path).toBe('/search/movie');
    expect(r.params).toMatchObject({
      query: 'alien',
      primary_release_year: 1979,
      include_adult: 'false',
    });
  });

  it('uses discover for filters and sorts', () => {
    const r = buildListRequest(q({ genre: 'action', minRating: 7, sort: 'rating' }), 28, now);
    expect(r.path).toBe('/discover/movie');
    expect(r.params).toMatchObject({
      with_genres: 28,
      'vote_average.gte': 7,
      sort_by: 'vote_average.desc',
      'vote_count.gte': 200,
    });
    const upcoming = buildListRequest(q({ category: 'upcoming', genre: 'drama' }), 18, now);
    expect(upcoming.params).toMatchObject({
      'primary_release_date.gte': '2026-11-01',
      sort_by: 'primary_release_date.asc',
    });
    expect(buildListRequest(q({ sort: 'title', year: 2001 }), undefined, now).params).toMatchObject(
      {
        sort_by: 'title.asc',
        primary_release_year: 2001,
      },
    );
  });
});

describe('tmdbPageWindow', () => {
  it('maps our page/pageSize onto 20-item TMDB pages', () => {
    expect(tmdbPageWindow(1, 20)).toEqual({ start: 0, first: 1, last: 1, offset: 0 });
    expect(tmdbPageWindow(2, 50)).toEqual({ start: 50, first: 3, last: 5, offset: 10 });
    expect(tmdbPageWindow(3, 10)).toEqual({ start: 20, first: 2, last: 2, offset: 0 });
  });
});

describe('TMDB mapping', () => {
  it('maps list items with CDN image URLs and attribution', () => {
    const m = mapListItem(details);
    expect(m).toMatchObject({
      tmdbId: 550,
      source: 'TMDB',
      title: 'Fixture Feature',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster550.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop550.jpg',
      voteAverage: 8.4,
      attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    });
    expect(
      mapListItem({ id: 1, title: 'Unrated', vote_average: 0, vote_count: 0 }).voteAverage,
    ).toBeNull();
    expect(mapListItem({ id: 1, title: 'No art', poster_path: null }).posterUrl).toBeNull();
  });

  it('maps details: runtime, cast order, embeddable trailers only', () => {
    const d = mapDetails(details);
    expect(d.runtimeMin).toBe(139);
    expect(d.tagline).toBe('A tagline.');
    expect((d.cast as Array<{ name: string }>).map((c) => c.name)).toEqual([
      'Top Billed',
      'Second Billed',
    ]);
    expect(mapTrailers(details)).toEqual([
      { site: 'YouTube', key: 'trailerKey1', name: 'Official Trailer' },
      { site: 'YouTube', key: 'teaserKey01', name: 'Teaser' },
    ]);
  });

  it('parses only well-formed release dates', () => {
    expect(parseReleaseDate('1999-10-15')?.toISOString()).toBe('1999-10-15T00:00:00.000Z');
    expect(parseReleaseDate('')).toBeNull();
    expect(parseReleaseDate('soon')).toBeNull();
  });
});
