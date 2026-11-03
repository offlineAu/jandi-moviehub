import { describe, expect, it } from 'vitest';
import { profilePatchSchema } from './profile.schemas';

describe('profilePatchSchema', () => {
  it('keeps only provided preference/privacy keys', () => {
    expect(
      profilePatchSchema.parse({
        preferences: { defaultVolume: 0.3 },
        privacy: { discoverable: false },
      }),
    ).toEqual({
      preferences: { defaultVolume: 0.3 },
      privacy: { discoverable: false },
    });
  });
  it('still validates values and rejects unknown keys', () => {
    expect(profilePatchSchema.safeParse({ preferences: { defaultVolume: 2 } }).success).toBe(false);
    expect(
      profilePatchSchema.safeParse({ privacy: { profileVisibility: 'EVERYONE' } }).success,
    ).toBe(false);
    expect(profilePatchSchema.safeParse({ preferences: { theme: 'dark' } }).success).toBe(false);
  });
});
