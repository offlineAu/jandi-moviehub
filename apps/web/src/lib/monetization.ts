export type Sponsor = {
  name: string;
  message: string;
  url: string;
  startsAt: string;
  endsAt: string;
};

export function supportUrlFromEnv(env: Record<string, string | undefined>): string | null {
  if (env.SUPPORT_ENABLED !== 'true' || !env.SUPPORT_URL) return null;
  try {
    const url = new URL(env.SUPPORT_URL.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Fail closed if the campaign is incomplete or has an unsafe destination. */
export function sponsorFromEnv(env: Record<string, string | undefined>): Sponsor | null {
  if (env.SPONSOR_ENABLED !== 'true') return null;
  const name = env.SPONSOR_NAME?.trim();
  const message = env.SPONSOR_MESSAGE?.trim();
  const url = env.SPONSOR_URL?.trim();
  const startsAt = env.SPONSOR_STARTS_AT?.trim();
  const endsAt = env.SPONSOR_ENDS_AT?.trim();
  if (!name || name.length > 80 || !message || message.length > 180 || !url || !startsAt || !endsAt)
    return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    // Explicit UTC timestamps avoid ambiguous local dates and end-of-day interpretation.
    const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    if (!utcTimestamp.test(startsAt) || !utcTimestamp.test(endsAt)) return null;
    const start = Date.parse(startsAt);
    const end = Date.parse(endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { name, message, url: parsed.href, startsAt, endsAt };
  } catch {
    return null;
  }
}
