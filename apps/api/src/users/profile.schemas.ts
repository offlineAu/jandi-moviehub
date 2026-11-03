import { preferencesSchema, privacySchema, updateProfileSchema } from '@jandi/shared';
import { z } from 'zod';

/**
 * `preferencesSchema.partial()` in Zod 4 still fills in field defaults, which would reset every
 * preference/privacy key the client did not send. These variants strip the defaults so a PATCH
 * only carries the keys that were actually provided.
 */
function withoutDefaults<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const inner =
        field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
      return [key, inner.optional()];
    }),
  );
  return z.strictObject(shape);
}

export const preferencesPatchSchema = withoutDefaults(preferencesSchema);
export const privacyPatchSchema = withoutDefaults(privacySchema);

export const profilePatchSchema = updateProfileSchema.extend({
  preferences: preferencesPatchSchema.optional(),
  privacy: privacyPatchSchema.optional(),
});
export type ProfilePatchInput = {
  displayName?: string;
  bio?: string;
  preferences?: Partial<z.infer<typeof preferencesSchema>>;
  privacy?: Partial<z.infer<typeof privacySchema>>;
};
