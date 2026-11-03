/** Subset of TMDB v3 response shapes that we consume. */
export interface TmdbMovieListItem {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  genre_ids?: number[];
  adult?: boolean;
}

export interface TmdbPage<T = TmdbMovieListItem> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCastMember {
  name: string;
  character?: string | null;
  profile_path?: string | null;
  order?: number;
}

export interface TmdbVideo {
  site: string;
  key: string;
  name: string;
  type: string;
  official?: boolean;
}

export interface TmdbMovieDetails extends Omit<TmdbMovieListItem, 'genre_ids'> {
  genres?: TmdbGenre[];
  runtime?: number | null;
  tagline?: string | null;
  credits?: { cast?: TmdbCastMember[] };
  videos?: { results?: TmdbVideo[] };
  similar?: TmdbPage;
  recommendations?: TmdbPage;
}
