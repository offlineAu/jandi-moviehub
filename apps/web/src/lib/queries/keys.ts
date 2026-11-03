import type { MovieListParams } from '../types';

export const qk = {
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
  oauthProviders: ['auth', 'oauth-providers'] as const,
  catalogInfo: ['catalog', 'info'] as const,
  genres: ['catalog', 'genres'] as const,
  movies: (params: MovieListParams) => ['catalog', 'movies', params] as const,
  movie: (id: string) => ['catalog', 'movie', id] as const,
  similar: (id: string) => ['catalog', 'movie', id, 'similar'] as const,
  recommendations: (id: string) => ['catalog', 'movie', id, 'recommendations'] as const,
  playback: (id: string) => ['catalog', 'movie', id, 'playback'] as const,
  libraryStatus: (id: string) => ['library', 'status', id] as const,
  favorites: (page: number) => ['library', 'favorites', page] as const,
  favoritesAll: ['library', 'favorites'] as const,
  watchlists: ['library', 'watchlists'] as const,
  watchlist: (id: string) => ['library', 'watchlists', id] as const,
  history: (page: number) => ['library', 'history', page] as const,
  historyAll: ['library', 'history'] as const,
  continueWatching: ['library', 'continue'] as const,
  profile: (username: string) => ['profiles', username] as const,
};
