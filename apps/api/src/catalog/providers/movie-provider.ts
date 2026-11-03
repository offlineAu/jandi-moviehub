import type { MovieListQuery } from '@jandi/shared';
import type { Movie } from '@prisma/client';

export interface ProviderListResult {
  /** Internal movie UUIDs in display order. */
  ids: string[];
  total: number;
}

/**
 * A source of catalog data. Providers resolve lists to internal movie UUIDs (TMDB titles are
 * upserted into `movies` first); `CatalogService` turns ids into DTOs.
 */
export interface MovieProvider {
  readonly kind: 'tmdb' | 'local';
  list(query: MovieListQuery, viewerId?: string): Promise<ProviderListResult>;
  /** Refreshes stored metadata for a movie if stale (no-op for local data). */
  refresh(movie: Movie): Promise<void>;
  similar(movie: Movie, viewerId?: string): Promise<string[]>;
  recommendations(movie: Movie, viewerId?: string): Promise<string[]>;
  syncGenres(): Promise<void>;
}

export const RELATED_LIMIT = 12;
