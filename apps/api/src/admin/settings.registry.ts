import { cleanText } from '@jandi/shared';
import { z } from 'zod';

export const SETTING_KEY = /^[a-z0-9_.-]{2,64}$/;

interface SettingDef<T> {
  schema: z.ZodType<T>;
  default: T;
  /** Exposed by the unauthenticated `GET /settings/public`. */
  public: boolean;
  description: string;
}

const def = <T>(d: SettingDef<T>) => d;

/** Whitelist of runtime settings. Unknown keys are rejected; every value is validated per key. */
export const SETTINGS = {
  'site.announcement': def({
    schema: z.string().max(280).transform(cleanText),
    default: '',
    public: true,
    description: 'Banner text shown site-wide (empty = none). Max 280 characters.',
  }),
  'rooms.maxMembersDefault': def({
    schema: z.number().int().min(2).max(100),
    default: 20,
    public: false,
    description: 'Default member cap for new rooms (2–100).',
  }),
  'chat.slowModeSec': def({
    schema: z.number().int().min(0).max(60),
    default: 0,
    public: false,
    description: 'Minimum seconds between chat messages per user (0 = off, max 60).',
  }),
  'registration.enabled': def({
    schema: z.boolean(),
    default: true,
    public: true,
    description: 'Whether new account registration is open.',
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'];

export const isSettingKey = (key: string): key is SettingKey =>
  Object.prototype.hasOwnProperty.call(SETTINGS, key);

const CANONICAL = new Map((Object.keys(SETTINGS) as SettingKey[]).map((k) => [k.toLowerCase(), k]));

/**
 * Validates a key from the URL and returns its canonical spelling. The key pattern
 * `^[a-z0-9_.-]{2,64}$` is applied to the lower-cased key because one whitelisted key is
 * camelCase (`rooms.maxMembersDefault`); lookups are therefore case-insensitive.
 */
export function resolveSettingKey(
  raw: string,
): { ok: true; key: SettingKey } | { ok: false; reason: 'INVALID' | 'UNKNOWN' } {
  if (!SETTING_KEY.test(raw.toLowerCase())) return { ok: false, reason: 'INVALID' };
  const key = CANONICAL.get(raw.toLowerCase());
  return key ? { ok: true, key } : { ok: false, reason: 'UNKNOWN' };
}
