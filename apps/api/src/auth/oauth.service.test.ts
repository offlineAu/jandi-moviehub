import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuthService } from './oauth.service';

function setup() {
  const redis = {
    set: vi.fn(),
    getdel: vi.fn().mockResolvedValue(JSON.stringify({ provider: 'google', returnTo: '/' })),
  };
  const prisma = {
    oAuthAccount: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'existing' }),
      create: vi.fn().mockResolvedValue({ id: 'new' }),
    },
  };
  const config = {
    env: {
      PUBLIC_WEB_URL: 'https://example.com',
      OAUTH_GOOGLE_CLIENT_ID: 'client',
      OAUTH_GOOGLE_CLIENT_SECRET: 'secret',
    },
  };
  return {
    service: new OAuthService(config as never, prisma as never, redis as never),
    prisma,
    redis,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Google OAuth', () => {
  it('rejects unsafe return paths before storing state', async () => {
    const { service, redis } = setup();
    await service.start('google', '/\\evil.example');
    expect(JSON.parse(redis.set.mock.calls[0]![1] as string).returnTo).toBe('/');
  });

  it.each([
    { email: 'person@gmail.com', email_verified: true, linked: true },
    { email: 'person@company.example', email_verified: true, hd: 'company.example', linked: true },
    { email: 'person@other.example', email_verified: true, linked: false },
    { email: 'person@gmail.com', email_verified: false, linked: false },
  ])(
    'only links existing accounts when Google is authoritative: $email',
    async ({ linked, ...profile }) => {
      const { service, prisma } = setup();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' })))
          .mockResolvedValueOnce(new Response(JSON.stringify({ sub: 'google-id', ...profile }))),
      );
      const result = await service.complete('google', 'code', 'state', 'state');
      expect(result.userId).toBe(linked ? 'existing' : 'new');
      expect(prisma.oAuthAccount.create).toHaveBeenCalledTimes(linked ? 1 : 0);
      if (!linked) expect(prisma.user.create.mock.calls[0]![0].data.email).toBeNull();
    },
  );

  it('rejects a failed or incomplete Google profile', async () => {
    const { service, prisma } = setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' })))
        .mockResolvedValueOnce(new Response('{}', { status: 401 })),
    );
    await expect(service.complete('google', 'code', 'state', 'state')).rejects.toMatchObject({
      code: 'OAUTH_PROFILE_FAILED',
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
