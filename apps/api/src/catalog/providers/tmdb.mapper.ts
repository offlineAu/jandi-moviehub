import type { Prisma } from '@prisma/client';
import { TMDB_ATTRIBUTION, type CastMember, type Trailer } from '../catalog.types';
import type { TmdbMovieDetails, TmdbMovieListItem } from './tmdb.types';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
export const posterUrl = (path?: string | null) => (path ? `${TMDB_IMAGE_BASE}/w500${path}` : null);
export const backdropUrl = (path?: string | null) =>
  path ? `${TMDB_IMAGE_BASE}/w1280${path}` : null;
export const profileUrl = (path?: string | null) =>
  path ? `${TMDB_IMAGE_BASE}/w185${path}` : null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function parseReleaseDate(value?: string | null): Date | null {
  if (!value || !DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const nonEmpty = (v?: string | null) => (v && v.trim() ? v.trim() : null);

/** Columns refreshed from a TMDB list item (present in list *and* detail responses). */
export function mapListItem(
  item: TmdbMovieListItem,
): Prisma.MovieUpdateInput & { tmdbId: number; title: string } {
  return {
    tmdbId: item.id,
    source: 'TMDB',
    isDemo: false,
    title: item.title,
    originalTitle: nonEmpty(item.original_title),
    overview: nonEmpty(item.overview),
    releaseDate: parseReleaseDate(item.release_date),
    posterUrl: posterUrl(item.poster_path),
    backdropUrl: backdropUrl(item.backdrop_path),
    // TMDB reports 0 for unrated titles; that's "no rating", not a rating of zero.
    voteAverage: item.vote_count ? (item.vote_average ?? null) : null,
    voteCount: item.vote_count ?? null,
    popularity: item.popularity ?? 0,
    originalLanguage: nonEmpty(item.original_language),
    attribution: TMDB_ATTRIBUTION,
  };
}

export function mapCast(details: TmdbMovieDetails, limit = 15): CastMember[] {
  return (details.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, limit)
    .map((c) => ({
      name: c.name,
      character: nonEmpty(c.character),
      profileUrl: profileUrl(c.profile_path),
    }));
}

export function mapTrailers(details: TmdbMovieDetails, limit = 5): Trailer[] {
  const rank = (type: string) => (type === 'Trailer' ? 0 : type === 'Teaser' ? 1 : 2);
  return (details.videos?.results ?? [])
    .filter(
      (v) => (v.site === 'YouTube' || v.site === 'Vimeo') && /^[A-Za-z0-9_-]{1,64}$/.test(v.key),
    )
    .filter((v) => v.type === 'Trailer' || v.type === 'Teaser')
    .sort((a, b) => rank(a.type) - rank(b.type) || Number(!!b.official) - Number(!!a.official))
    .slice(0, limit)
    .map((v) => ({ site: v.site as Trailer['site'], key: v.key, name: v.name }));
}

/** Full column set from a details response (append_to_response=credits,videos,…). */
export function mapDetails(details: TmdbMovieDetails) {
  return {
    ...mapListItem(details),
    tagline: nonEmpty(details.tagline),
    runtimeMin: details.runtime && details.runtime > 0 ? details.runtime : null,
    cast: mapCast(details) as unknown as Prisma.InputJsonValue,
    trailers: mapTrailers(details) as unknown as Prisma.InputJsonValue,
    metadataSyncedAt: new Date(),
  };
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
