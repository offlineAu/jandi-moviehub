import type { LicenseType, MediaFormat } from '@prisma/client';

export interface MovieSummary {
  id: string;
  title: string;
  year: number | null;
  releaseDate: string | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  runtimeMin: number | null;
  genres: string[];
  playable: boolean;
  isDemo: boolean;
  source: 'TMDB' | 'LOCAL';
}

export interface CastMember {
  name: string;
  character: string | null;
  profileUrl: string | null;
}

export interface Trailer {
  site: 'YouTube' | 'Vimeo';
  key: string;
  name: string;
}

export interface MovieDetail extends MovieSummary {
  tagline: string | null;
  originalTitle: string | null;
  originalLanguage: string | null;
  voteCount: number | null;
  cast: CastMember[];
  trailers: Trailer[];
  media: Array<{ id: string; label: string; format: MediaFormat; durationSec: number }>;
  license: { type: LicenseType; licensor: string; attribution: string | null } | null;
  attribution: string | null;
}

export interface PlaybackSource {
  assetId: string;
  label: string;
  format: MediaFormat;
  mimeType: string;
  durationSec: number;
  url: string;
  captions: Array<{ lang: string; label: string; url: string }>;
  license: { type: LicenseType; attribution: string | null };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Caption track metadata stored in `media_assets.captions`. */
export interface StoredCaption {
  lang: string;
  label: string;
  storageKey: string;
}

export const TMDB_ATTRIBUTION =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.';
export const TMDB_ATTRIBUTION_URL = 'https://www.themoviedb.org/';

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
): Paginated<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
