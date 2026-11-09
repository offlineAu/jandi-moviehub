import { playbackSelectionSchema } from '../playback-selection';
import { roomTitleSchema } from '../room-title';
import { z } from 'zod';
import {
  CONTROL_POLICIES,
  LICENSE_TYPES,
  MEDIA_ASSET_STATUSES,
  MEDIA_FORMATS,
  MOVIE_CATEGORIES,
  PLAYLIST_VISIBILITIES,
  REACTION_EMOJI,
  REPORT_STATUSES,
  REPORT_TARGETS,
  ROOM_VISIBILITIES,
  USER_ROLES,
  VISIBILITY_LEVELS,
} from '../constants';

/** Strips ASCII control characters (except newline/tab) and trims. */
export const cleanText = (value: string) =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

const text = (min: number, max: number) =>
  z.string().transform(cleanText).pipe(z.string().min(min).max(max));

export const uuidSchema = z.uuid();

// ---------- Auth ----------
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, 'Use 3–24 lowercase letters, numbers or underscores');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: text(1, 40),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const guestSchema = z.object({ displayName: text(1, 40) });
export type GuestInput = z.infer<typeof guestSchema>;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

// ---------- Profile ----------
export const preferencesSchema = z.object({
  autoplayNext: z.boolean().default(true),
  captionsByDefault: z.boolean().default(false),
  defaultVolume: z.number().min(0).max(1).default(0.8),
  reduceMotion: z.boolean().default(false),
  browserNotifications: z.boolean().default(false),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const privacySchema = z.object({
  profileVisibility: z.enum(VISIBILITY_LEVELS).default('PUBLIC'),
  watchHistoryVisibility: z.enum(VISIBILITY_LEVELS).default('PRIVATE'),
  showOnlineStatus: z.boolean().default(true),
  discoverable: z.boolean().default(true),
});
export type Privacy = z.infer<typeof privacySchema>;

export const updateProfileSchema = z.object({
  displayName: text(1, 40).optional(),
  bio: text(0, 280).optional(),
  // Built without defaults: a partial update must not reset the user's other settings.
  preferences: z
    .object({
      autoplayNext: z.boolean(),
      captionsByDefault: z.boolean(),
      defaultVolume: z.number().min(0).max(1),
      reduceMotion: z.boolean(),
      browserNotifications: z.boolean(),
    })
    .partial()
    .optional(),
  privacy: z
    .object({
      profileVisibility: z.enum(VISIBILITY_LEVELS),
      watchHistoryVisibility: z.enum(VISIBILITY_LEVELS),
      showOnlineStatus: z.boolean(),
      discoverable: z.boolean(),
    })
    .partial()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---------- Pagination / movies ----------
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

export const movieListQuerySchema = paginationSchema.extend({
  category: z.enum(MOVIE_CATEGORIES).optional(),
  genre: z.string().trim().max(40).optional(),
  q: z.string().trim().max(100).optional(),
  year: z.coerce.number().int().min(1870).max(2100).optional(),
  minRating: z.coerce.number().min(0).max(10).optional(),
  playable: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sort: z.enum(['popularity', 'rating', 'release', 'title']).optional(),
});
export type MovieListQuery = z.infer<typeof movieListQuerySchema>;

// ---------- Library ----------
export const createWatchlistSchema = z.object({
  name: text(1, 60),
  description: text(0, 280).optional(),
});
export const addMovieSchema = z.object({ movieId: uuidSchema });
export const progressSchema = z.object({
  movieId: uuidSchema,
  positionSec: z
    .number()
    .min(0)
    .max(60 * 60 * 12),
  durationSec: z
    .number()
    .min(0)
    .max(60 * 60 * 12)
    .optional(),
});

// ---------- Rooms ----------
/** Room fields without defaults, so partial updates never reset unspecified fields. */
const roomFields = {
  name: text(3, 60),
  description: text(0, 280).optional(),
  visibility: z.enum(ROOM_VISIBILITIES),
  password: z.string().min(4).max(64).optional(),
  movieId: roomTitleSchema.optional(),
  playbackSelection: playbackSelectionSchema.optional(),
  allowGuests: z.boolean(),
  controlPolicy: z.enum(CONTROL_POLICIES),
  maxMembers: z.number().int().min(2).max(100),
  scheduledFor: z.iso.datetime().optional(),
};
export const createRoomSchema = z
  .object({
    ...roomFields,
    allowGuests: roomFields.allowGuests.default(false),
    controlPolicy: roomFields.controlPolicy.default('HOSTS'),
    // Omitted → the admin setting `rooms.maxMembersDefault`.
    maxMembers: roomFields.maxMembers.optional(),
  })
  .refine((v) => !(v.movieId && v.playbackSelection), {
    message: 'Choose one playback selection',
    path: ['playbackSelection'],
  })
  .refine((v) => v.visibility !== 'PASSWORD' || !!v.password, {
    message: 'Password-protected rooms need a password',
    path: ['password'],
  });
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export const updateRoomSchema = z.object(roomFields).partial();
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const joinRoomSchema = z.object({
  password: z.string().max(64).optional(),
  inviteToken: z.string().max(200).optional(),
});
export const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(72),
  inviteeUserId: uuidSchema.optional(),
});
export const memberRoleSchema = z.object({ role: z.enum(['COHOST', 'MEMBER']) });
export const banSchema = z.object({ reason: text(0, 200).optional() });
export const transferHostSchema = z.object({ userId: uuidSchema });
export const roomQuerySchema = paginationSchema.extend({ q: z.string().trim().max(60).optional() });

// ---------- Chat ----------
export const sendMessageSchema = z.object({
  roomId: uuidSchema,
  body: text(1, 1000),
  replyToId: uuidSchema.optional(),
  clientId: z.string().max(64).optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export const reactionEmojiSchema = z.enum(REACTION_EMOJI);
export const reactSchema = z.object({
  roomId: uuidSchema,
  messageId: uuidSchema,
  emoji: reactionEmojiSchema,
});
export const burstSchema = z.object({ roomId: uuidSchema, emoji: reactionEmojiSchema });
export const messageQuerySchema = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------- Playlists / marathon ----------
const playlistFields = {
  name: text(1, 80),
  description: text(0, 500).optional(),
  visibility: z.enum(PLAYLIST_VISIBILITIES),
  collaborative: z.boolean(),
};
export const createPlaylistSchema = z.object({
  ...playlistFields,
  visibility: playlistFields.visibility.default('PRIVATE'),
  collaborative: playlistFields.collaborative.default(false),
});
export const updatePlaylistSchema = z.object(playlistFields).partial();
export const reorderPlaylistSchema = z.object({ itemIds: z.array(uuidSchema).min(1).max(200) });
export const collaboratorSchema = z.object({ username: usernameSchema });
export const marathonConfigSchema = z.object({
  playlistId: uuidSchema,
  countdownSec: z.number().int().min(0).max(60).default(10),
  intermissionSec: z.number().int().min(0).max(1800).default(30),
  votingEnabled: z.boolean().default(false),
  scheduledFor: z.iso.datetime().optional(),
});
export type MarathonConfigInput = z.infer<typeof marathonConfigSchema>;
export const marathonVoteSchema = z.object({ roomId: uuidSchema, playlistItemId: uuidSchema });

// ---------- Social ----------
export const friendRequestSchema = z.object({ username: usernameSchema });
export const userSearchSchema = z.object({ q: z.string().trim().min(2).max(40) });

// ---------- Reports ----------
export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: uuidSchema,
  reason: text(3, 500),
});
export const resolveReportSchema = z.object({
  status: z.enum(REPORT_STATUSES).exclude(['OPEN']),
  resolutionNote: text(0, 500).optional(),
});

// ---------- Admin ----------
export const adminUserUpdateSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  suspended: z.boolean().optional(),
});
export const adminMovieSchema = z.object({
  title: text(1, 200),
  overview: text(0, 4000).optional(),
  releaseDate: z.iso.date().optional(),
  runtimeMin: z.number().int().min(1).max(1000).optional(),
  genres: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  posterUrl: z.url().max(500).optional(),
  backdropUrl: z.url().max(500).optional(),
  isDemo: z.boolean().default(false),
});
export const adminLicenseSchema = z.object({
  type: z.enum(LICENSE_TYPES),
  title: text(1, 200),
  licensor: text(1, 200),
  territory: text(1, 100).default('WORLDWIDE'),
  provenanceUrl: z.url().max(500).optional(),
  attribution: text(0, 500).optional(),
  validFrom: z.iso.datetime().optional(),
  validUntil: z.iso.datetime().optional(),
  notes: text(0, 2000).optional(),
});
export const adminMediaAssetSchema = z.object({
  movieId: uuidSchema,
  licenseId: uuidSchema,
  format: z.enum(MEDIA_FORMATS),
  storageKey: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9._\-/]+$/, 'Invalid storage key'),
  mimeType: z.string().trim().max(100),
  durationSec: z
    .number()
    .min(1)
    .max(60 * 60 * 12),
  label: text(1, 80).default('Main feature'),
});
export const adminMediaStatusSchema = z.object({ status: z.enum(MEDIA_ASSET_STATUSES) });
export const appSettingSchema = z.object({ value: z.json() });
