import { createWatchlistSchema, usernameSchema } from '@jandi/shared';
import { z } from 'zod';

export const updateWatchlistSchema = createWatchlistSchema
  .partial()
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateWatchlistInput = z.infer<typeof updateWatchlistSchema>;

export const addWatchlistMemberSchema = z.object({ username: usernameSchema });

/** Completed once this share of the runtime has been watched. */
export const COMPLETION_RATIO = 0.95;
/** Minimum position for "continue watching". */
export const CONTINUE_MIN_SEC = 30;
export const MAX_WATCHLISTS_PER_USER = 100;
