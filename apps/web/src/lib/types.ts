import type { Preferences, Privacy, UserRole, VisibilityLevel } from '@jandi/shared';

/** Mirrors docs/api/ENDPOINTS.md (REST contract v1). */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
}

export interface Me extends PublicUser {
  email: string | null;
  role: UserRole;
  emailVerified: boolean;
  bio: string | null;
  /** The API may omit unset keys; use `resolvePreferences()` to apply defaults. */
  preferences: Partial<Preferences>;
  privacy: Privacy;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ItemList<T> {
  items: T[];
}

export type MovieSource = 'TMDB' | 'LOCAL';
export type MediaFormat = 'MP4' | 'WEBM' | 'HLS';

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
  source: MovieSource;
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
  license: { type: string; licensor: string; attribution: string | null } | null;
  attribution: string | null;
}

export interface CaptionTrack {
  lang: string;
  label: string;
  url: string;
}

export interface PlaybackSource {
  assetId: string;
  label: string;
  format: MediaFormat;
  mimeType: string;
  durationSec: number;
  url: string;
  captions: CaptionTrack[];
  license: { type: string; attribution: string | null } | null;
}

export interface CatalogInfo {
  provider: 'tmdb' | 'local';
  label: string;
  attribution: string | null;
  attributionUrl: string | null;
}

export interface Genre {
  id: string;
  name: string;
  slug: string;
}

export interface FavoriteEntry {
  movie: MovieSummary;
  createdAt: string;
}

export interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isGroup: boolean;
  itemCount: number;
  owner: PublicUser;
  members: PublicUser[];
  previewPosters: string[];
}

export interface WatchlistItem {
  id: string;
  movie: MovieSummary;
  addedBy: PublicUser | null;
  createdAt: string;
}

export interface WatchlistDetail {
  watchlist: Watchlist;
  items: WatchlistItem[];
}

export interface Progress {
  positionSec: number;
  durationSec: number;
  completed: boolean;
}

export interface LibraryStatus {
  favorite: boolean;
  watchlistIds: string[];
  progress: Progress | null;
}

export interface HistoryEntry extends Progress {
  movie: MovieSummary;
  lastWatchedAt: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface OAuthProvider {
  id: string;
  name: string;
}

export type Friendship = 'self' | 'friends' | 'outgoing' | 'incoming' | 'none';

export interface PublicProfile extends PublicUser {
  bio: string | null;
  createdAt: string;
  friendship: Friendship;
  stats: { favorites: number; playlists: number };
}

export interface ProfileResponse {
  profile: PublicProfile;
  favorites?: MovieSummary[];
  history?: HistoryEntry[];
}

export type { Preferences, Privacy, UserRole, VisibilityLevel };

export type MovieListParams = {
  category?: 'trending' | 'popular' | 'recent' | 'upcoming' | 'top-rated';
  genre?: string;
  q?: string;
  year?: number;
  minRating?: number;
  playable?: boolean;
  sort?: 'popularity' | 'rating' | 'release' | 'title';
  page?: number;
  pageSize?: number;
};
