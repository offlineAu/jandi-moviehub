'use client';

import type {
  LicenseType,
  MediaAssetStatus,
  MediaFormat,
  ReportStatus,
  ReportTarget,
  RoomStatus,
  RoomVisibility,
  StorageDriver,
  UserRole,
} from '@jandi/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { ApiError, apiFetch, buildApiUrl, parseApiError } from '../api';
import type { ItemList, Paginated, PublicUser } from '../types';

/* ───────────────────────── Types (docs/api/ADMIN.md) ───────────────────────── */

export interface SyncStats {
  samples: number;
  p50Ms: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  /** Share of samples (0–1) within 100 ms; null without samples. */
  within100ms: number | null;
  within250ms: number | null;
}

export interface AdminOverview {
  users: {
    total: number;
    registered: number;
    guests: number;
    suspended: number;
    newLast7d: number;
  };
  rooms: {
    open: number;
    createdLast7d: number;
    recentlyActiveRooms: number;
    recentlyActiveWindowMin: number;
  };
  messages: { last24h: number };
  movies: { total: number; playable: number };
  mediaAssets: Record<MediaAssetStatus, number>;
  reports: { open: number };
  sync: SyncStats;
  generatedAt: string;
}

export interface DailyPoint {
  date: string;
  count: number;
}

export const ANALYTICS_SERIES = [
  'signups',
  'roomsCreated',
  'messages',
  'watchHistoryUpdates',
] as const;
export type AnalyticsSeries = (typeof ANALYTICS_SERIES)[number];

export interface AdminAnalytics {
  days: number;
  from: string;
  to: string;
  series: Record<AnalyticsSeries, DailyPoint[]>;
  topMovies: Array<{ movieId: string; title: string; viewers: number }>;
}

export interface AdminUser extends PublicUser {
  email: string | null;
  role: UserRole;
  emailVerified: boolean;
  suspended: boolean;
  suspendedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AdminMovie {
  id: string;
  title: string;
  source: 'TMDB' | 'LOCAL';
  tmdbId: number | null;
  isDemo: boolean;
  overview: string | null;
  releaseDate: string | null;
  runtimeMin: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  assetCount: number;
  playable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMovieInput {
  title: string;
  overview?: string | null;
  releaseDate?: string | null;
  runtimeMin?: number | null;
  genres?: string[];
  posterUrl?: string | null;
  backdropUrl?: string | null;
  isDemo?: boolean;
}

export interface AdminLicense {
  id: string;
  type: LicenseType;
  title: string;
  licensor: string;
  territory: string;
  provenanceUrl: string | null;
  attribution: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: PublicUser | null;
  usable: boolean;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLicenseInput {
  type?: LicenseType;
  title?: string;
  licensor?: string;
  territory?: string;
  provenanceUrl?: string | null;
  attribution?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
}

export interface AdminMediaAsset {
  id: string;
  movie: { id: string; title: string };
  license: { id: string; title: string; type: LicenseType; verified: boolean; usable: boolean };
  label: string;
  format: MediaFormat;
  storageDriver: StorageDriver;
  storageKey: string;
  mimeType: string;
  durationSec: number;
  sizeBytes: number | null;
  status: MediaAssetStatus;
  approvedAt: string | null;
  approvedBy: PublicUser | null;
  playable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMediaInput {
  movieId: string;
  licenseId: string;
  format: MediaFormat;
  storageKey: string;
  mimeType: string;
  durationSec: number;
  label?: string;
}

export interface MediaUpload {
  storageKey: string;
  format: 'WEBM' | 'MP4';
  mimeType: string;
  sizeBytes: number;
  storageDriver: StorageDriver;
}

export interface AdminRoom {
  id: string;
  code: string;
  name: string;
  visibility: RoomVisibility;
  status: RoomStatus;
  allowGuests: boolean;
  maxMembers: number;
  host: PublicUser;
  movie: { id: string; title: string } | null;
  memberCount: number;
  messageCount: number;
  onlineCount: number;
  createdAt: string;
  lastActiveAt: string | null;
  closedAt: string | null;
}

export interface Report {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  reason: string;
  status: ReportStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type ReportTargetPreview =
  | { type: 'USER'; user: PublicUser; suspended: boolean }
  | {
      type: 'MESSAGE';
      id: string;
      body: string;
      deleted: boolean;
      createdAt: string;
      author: PublicUser | null;
      room: { id: string; name: string };
    }
  | {
      type: 'ROOM';
      id: string;
      name: string;
      code: string;
      status: RoomStatus;
      visibility: RoomVisibility;
      host: PublicUser;
    }
  | { type: 'PLAYLIST'; id: string; name: string; visibility: string; owner: PublicUser };

export interface AdminReport extends Report {
  reporter: PublicUser | null;
  resolvedBy: PublicUser | null;
  target: ReportTargetPreview | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: PublicUser | null;
}

export interface AdminSetting {
  key: string;
  value: unknown;
  defaultValue: unknown;
  isDefault: boolean;
  public: boolean;
  description: string;
  updatedAt: string | null;
  updatedBy: PublicUser | null;
}

/* ───────────────────────── Query keys ───────────────────────── */

type Params = Record<string, string | number | boolean | undefined>;

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  analytics: (days: number) => ['admin', 'analytics', days] as const,
  users: (p: Params) => ['admin', 'users', p] as const,
  movies: (p: Params) => ['admin', 'movies', p] as const,
  licenses: (p: Params) => ['admin', 'licenses', p] as const,
  media: (p: Params) => ['admin', 'media', p] as const,
  rooms: (p: Params) => ['admin', 'rooms', p] as const,
  reports: (p: Params) => ['admin', 'reports', p] as const,
  audit: (p: Params) => ['admin', 'audit', p] as const,
  settings: ['admin', 'settings'] as const,
};

/** Invalidate the given admin scopes plus the overview counts (and the audit log). */
function invalidate(qc: QueryClient, ...scopes: string[]) {
  for (const scope of [...scopes, 'overview', 'audit']) {
    void qc.invalidateQueries({ queryKey: ['admin', scope] });
  }
}

/** Catalog mutations change public playability too. */
function invalidateCatalog(qc: QueryClient) {
  invalidate(qc, 'movies', 'licenses', 'media', 'analytics');
  void qc.invalidateQueries({ queryKey: ['catalog'] });
}

const enc = encodeURIComponent;
export const ADMIN_PAGE_SIZE = 20;

/* ───────────────────────── Overview & analytics ───────────────────────── */

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: () => apiFetch<AdminOverview>('/admin/overview'),
    enabled,
  });
}

export function useAdminAnalytics(days: number) {
  return useQuery({
    queryKey: adminKeys.analytics(days),
    queryFn: () => apiFetch<AdminAnalytics>('/admin/analytics', { query: { days } }),
    placeholderData: keepPreviousData,
  });
}

/* ───────────────────────── Users ───────────────────────── */

export function useAdminUsers(params: { q?: string; role?: UserRole; page: number }) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () =>
      apiFetch<Paginated<AdminUser>>('/admin/users', {
        query: { ...params, pageSize: ADMIN_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: UserRole; suspended?: boolean }) =>
      apiFetch<{ user: AdminUser }>(`/admin/users/${enc(id)}`, { method: 'PATCH', body }),
    onSuccess: () => invalidate(qc, 'users'),
  });
}

/* ───────────────────────── Movies ───────────────────────── */

export function useAdminMovies(
  params: { q?: string; source?: 'TMDB' | 'LOCAL'; page: number; pageSize?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: adminKeys.movies(params),
    queryFn: () =>
      apiFetch<Paginated<AdminMovie>>('/admin/movies', {
        query: { pageSize: ADMIN_PAGE_SIZE, ...params },
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateAdminMovie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminMovieInput) =>
      apiFetch<{ movie: AdminMovie }>('/admin/movies', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useUpdateAdminMovie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AdminMovieInput> }) =>
      apiFetch<{ movie: AdminMovie }>(`/admin/movies/${enc(id)}`, {
        method: 'PATCH',
        body: body as Record<string, unknown>,
      }),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useDeleteAdminMovie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/movies/${enc(id)}`, { method: 'DELETE' }),
    onSuccess: () => invalidateCatalog(qc),
  });
}

/* ───────────────────────── Licenses ───────────────────────── */

export function useAdminLicenses(
  params: { q?: string; type?: LicenseType; verified?: boolean; page: number; pageSize?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: adminKeys.licenses(params),
    queryFn: () =>
      apiFetch<Paginated<AdminLicense>>('/admin/licenses', {
        query: { pageSize: ADMIN_PAGE_SIZE, ...params },
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateAdminLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminLicenseInput) =>
      apiFetch<{ license: AdminLicense }>('/admin/licenses', {
        method: 'POST',
        body: body as Record<string, unknown>,
      }),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useUpdateAdminLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminLicenseInput }) =>
      apiFetch<{ license: AdminLicense }>(`/admin/licenses/${enc(id)}`, {
        method: 'PATCH',
        body: body as Record<string, unknown>,
      }),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useSetLicenseVerified() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      apiFetch<{ license: AdminLicense }>(
        `/admin/licenses/${enc(id)}/${verified ? 'verify' : 'unverify'}`,
        { method: 'POST' },
      ),
    onSuccess: () => invalidateCatalog(qc),
  });
}

/* ───────────────────────── Media assets ───────────────────────── */

export function useAdminMedia(params: {
  status?: MediaAssetStatus;
  movieId?: string;
  page: number;
}) {
  return useQuery({
    queryKey: adminKeys.media(params),
    queryFn: () =>
      apiFetch<Paginated<AdminMediaAsset>>('/admin/media', {
        query: { ...params, pageSize: ADMIN_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useRegisterMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminMediaInput) =>
      apiFetch<{ asset: AdminMediaAsset }>('/admin/media', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useSetMediaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MediaAssetStatus }) =>
      apiFetch<{ asset: AdminMediaAsset }>(`/admin/media/${enc(id)}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => invalidateCatalog(qc),
  });
}

/**
 * Multipart upload with progress (fetch has no upload progress events). Errors are normalised to
 * `ApiError` exactly like `apiFetch`. Abort with the signal.
 */
export function uploadMediaFile(
  file: File,
  {
    onProgress,
    signal,
  }: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<MediaUpload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildApiUrl('/admin/media/upload'));
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((JSON.parse(xhr.responseText) as { upload: MediaUpload }).upload);
        } catch {
          reject(
            new ApiError({
              status: xhr.status,
              code: 'BAD_RESPONSE',
              message: 'Unexpected response',
            }),
          );
        }
        return;
      }
      const headers = new Headers();
      const retryAfter = xhr.getResponseHeader('Retry-After');
      if (retryAfter) headers.set('Retry-After', retryAfter);
      const status = xhr.status >= 400 && xhr.status <= 599 ? xhr.status : 500;
      void parseApiError(
        new Response(xhr.responseText || null, { status, statusText: xhr.statusText, headers }),
      ).then(reject);
    };
    xhr.onerror = () =>
      reject(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network request failed' }));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Upload cancelled', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    const body = new FormData();
    body.append('file', file);
    xhr.send(body);
  });
}

/* ───────────────────────── Moderation ───────────────────────── */

export function useAdminRooms(params: { q?: string; status?: RoomStatus; page: number }) {
  return useQuery({
    queryKey: adminKeys.rooms(params),
    queryFn: () =>
      apiFetch<Paginated<AdminRoom>>('/admin/rooms', {
        query: { ...params, pageSize: ADMIN_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCloseRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/rooms/${enc(id)}/close`, { method: 'POST' }),
    onSuccess: () => {
      invalidate(qc, 'rooms', 'reports');
      void qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useAdminReports(params: {
  status?: ReportStatus;
  targetType?: ReportTarget;
  page: number;
}) {
  return useQuery({
    queryKey: adminKeys.reports(params),
    queryFn: () =>
      apiFetch<Paginated<AdminReport>>('/admin/reports', {
        query: { ...params, pageSize: ADMIN_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status: 'RESOLVED' | 'DISMISSED';
      resolutionNote?: string;
    }) => apiFetch<{ report: Report }>(`/admin/reports/${enc(id)}`, { method: 'PATCH', body }),
    onSuccess: () => invalidate(qc, 'reports'),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/messages/${enc(id)}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(qc, 'reports', 'rooms'),
  });
}

export function useAdminAudit(params: { action?: string; actorId?: string; page: number }) {
  return useQuery({
    queryKey: adminKeys.audit(params),
    queryFn: () =>
      apiFetch<Paginated<AuditEntry>>('/admin/audit', {
        query: { ...params, pageSize: ADMIN_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
}

/* ───────────────────────── Settings ───────────────────────── */

export function useAdminSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => apiFetch<ItemList<AdminSetting>>('/admin/settings'),
  });
}

export function useSaveSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiFetch<{ setting: { key: string; value: unknown } }>(`/admin/settings/${enc(key)}`, {
        method: 'PUT',
        body: { value } as Record<string, unknown>,
      }),
    onSuccess: () => {
      invalidate(qc, 'settings');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
