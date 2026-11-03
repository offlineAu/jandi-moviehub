import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => argon2.hash(password, OPTIONS);

let dummyHash: Promise<string> | undefined;

/** Verifies a password; with no hash, burns equivalent time to avoid user enumeration by timing. */
export async function verifyPassword(
  hash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!hash) {
    dummyHash ??= argon2.hash('not-a-real-password-placeholder', OPTIONS);
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return argon2.verify(hash, password).catch(() => false);
}
