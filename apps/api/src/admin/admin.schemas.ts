import {
  adminLicenseSchema,
  adminMovieSchema,
  LICENSE_TYPES,
  MEDIA_ASSET_STATUSES,
  paginationSchema,
  REPORT_STATUSES,
  REPORT_TARGETS,
  ROOM_STATUSES,
  uuidSchema,
  USER_ROLES,
} from '@jandi/shared';
import { z } from 'zod';

/*
 * Query/patch schemas that only the admin API needs. Request bodies for creation reuse the
 * shared schemas (`adminMovieSchema`, `adminLicenseSchema`, …) unchanged.
 */

const q = z.string().trim().max(80).optional();
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const adminUserQuerySchema = paginationSchema.extend({
  q,
  role: z.enum(USER_ROLES).optional(),
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const adminMovieQuerySchema = paginationSchema.extend({
  q,
  source: z.enum(['TMDB', 'LOCAL']).optional(),
});
export type AdminMovieQuery = z.infer<typeof adminMovieQuerySchema>;

/**
 * PATCH body for movies. Zod 4 applies `.default()` even inside `.partial()`, so the
 * defaulted fields are redeclared as plain optionals (an omitted field is left unchanged).
 */
export const adminMoviePatchSchema = adminMovieSchema
  .extend({
    genres: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    isDemo: z.boolean().optional(),
  })
  .partial()
  .extend({
    // `null` clears an optional field.
    overview: adminMovieSchema.shape.overview.unwrap().nullable().optional(),
    releaseDate: z.iso.date().nullable().optional(),
    runtimeMin: z.number().int().min(1).max(1000).nullable().optional(),
    posterUrl: z.url().max(500).nullable().optional(),
    backdropUrl: z.url().max(500).nullable().optional(),
  });
export type AdminMoviePatch = z.infer<typeof adminMoviePatchSchema>;
export type AdminMovieInput = z.infer<typeof adminMovieSchema>;

export const adminLicenseQuerySchema = paginationSchema.extend({
  q,
  type: z.enum(LICENSE_TYPES).optional(),
  verified: bool.optional(),
});
export type AdminLicenseQuery = z.infer<typeof adminLicenseQuerySchema>;

export const adminLicensePatchSchema = adminLicenseSchema
  .extend({ territory: adminLicenseSchema.shape.territory.unwrap().optional() })
  .partial()
  .extend({
    provenanceUrl: z.url().max(500).nullable().optional(),
    attribution: adminLicenseSchema.shape.attribution.unwrap().nullable().optional(),
    validFrom: z.iso.datetime().nullable().optional(),
    validUntil: z.iso.datetime().nullable().optional(),
    notes: adminLicenseSchema.shape.notes.unwrap().nullable().optional(),
  });
export type AdminLicensePatch = z.infer<typeof adminLicensePatchSchema>;
export type AdminLicenseInput = z.infer<typeof adminLicenseSchema>;

export const adminMediaQuerySchema = paginationSchema.extend({
  status: z.enum(MEDIA_ASSET_STATUSES).optional(),
  movieId: uuidSchema.optional(),
});
export type AdminMediaQuery = z.infer<typeof adminMediaQuerySchema>;

export const adminRoomQuerySchema = paginationSchema.extend({
  q,
  status: z.enum(ROOM_STATUSES).optional(),
});
export type AdminRoomQuery = z.infer<typeof adminRoomQuerySchema>;

export const adminReportQuerySchema = paginationSchema.extend({
  status: z.enum(REPORT_STATUSES).optional(),
  targetType: z.enum(REPORT_TARGETS).optional(),
});

export const adminAuditQuerySchema = paginationSchema.extend({
  /** Exact action or a dotted prefix, e.g. `admin.user`. */
  action: z
    .string()
    .trim()
    .regex(/^[a-z0-9_.-]{1,64}$/)
    .optional(),
  actorId: uuidSchema.optional(),
});
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
