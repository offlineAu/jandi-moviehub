export const APP_NAME = 'Jandi MovieHub';
export const APP_TAGLINE = "Your Movie Night. Everyone's Invited.";

export const USER_ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROOM_VISIBILITIES = ['PUBLIC', 'PRIVATE', 'PASSWORD', 'FRIENDS'] as const;
export type RoomVisibility = (typeof ROOM_VISIBILITIES)[number];

export const ROOM_ROLES = ['HOST', 'COHOST', 'MEMBER'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

/** Who may issue playback commands in a room. */
export const CONTROL_POLICIES = ['HOST_ONLY', 'HOSTS', 'EVERYONE'] as const;
export type ControlPolicy = (typeof CONTROL_POLICIES)[number];

export const ROOM_STATUSES = ['OPEN', 'CLOSED'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const VISIBILITY_LEVELS = ['PUBLIC', 'FRIENDS', 'PRIVATE'] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

export const PLAYLIST_VISIBILITIES = ['PUBLIC', 'UNLISTED', 'PRIVATE'] as const;
export type PlaylistVisibility = (typeof PLAYLIST_VISIBILITIES)[number];

export const LICENSE_TYPES = [
  'PUBLIC_DOMAIN',
  'CREATIVE_COMMONS',
  'OWNED',
  'LICENSED',
  'DEMO_GENERATED',
] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

export const MEDIA_ASSET_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DISABLED'] as const;
export type MediaAssetStatus = (typeof MEDIA_ASSET_STATUSES)[number];

export const MEDIA_FORMATS = ['MP4', 'WEBM', 'HLS'] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];

export const STORAGE_DRIVERS = ['LOCAL', 'S3'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export const REPORT_TARGETS = ['USER', 'MESSAGE', 'ROOM', 'PLAYLIST'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'ROOM_INVITE',
  'ROOM_STARTING',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Emoji allowed for message reactions and floating room reactions. */
export const REACTION_EMOJI = ['🍿', '😂', '😱', '😍', '👏', '🔥', '😢', '👀'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export const MARATHON_STATES = [
  'IDLE',
  'READY',
  'COUNTDOWN',
  'PLAYING',
  'INTERMISSION',
  'TRANSITIONING',
  'COMPLETED',
  'ERROR',
] as const;
export type MarathonStateName = (typeof MARATHON_STATES)[number];

export const SESSION_COOKIE = 'jandi_session';
export const MOVIE_CATEGORIES = ['trending', 'popular', 'recent', 'upcoming', 'top-rated'] as const;
export type MovieCategory = (typeof MOVIE_CATEGORIES)[number];
