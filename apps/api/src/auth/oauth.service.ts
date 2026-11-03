import { Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { randomToken } from '../common/crypto';
import { Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '../redis/redis.module';

export interface OAuthProviderConfig {
  id: 'github' | 'google';
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
}

interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  username: string;
}

const STATE_TTL_SEC = 600;

/**
 * Authorization-code OAuth adapter. Providers are only enabled when their client
 * credentials are configured; otherwise endpoints respond 404 and the UI hides them.
 */
@Injectable()
export class OAuthService {
  readonly providers: OAuthProviderConfig[];

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    const env = config.env;
    this.providers = [
      {
        id: 'github',
        name: 'GitHub',
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scope: 'read:user user:email',
        clientId: env.OAUTH_GITHUB_CLIENT_ID,
        clientSecret: env.OAUTH_GITHUB_CLIENT_SECRET,
      },
      {
        id: 'google',
        name: 'Google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'openid email profile',
        clientId: env.OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
      },
    ];
  }

  enabled() {
    return this.providers
      .filter((p) => p.clientId && p.clientSecret)
      .map(({ id, name }) => ({ id, name }));
  }

  private provider(id: string): OAuthProviderConfig {
    const provider = this.providers.find((p) => p.id === id);
    if (!provider?.clientId || !provider.clientSecret) throw Errors.notFound('OAuth provider');
    return provider;
  }

  private redirectUri(id: string) {
    return `${this.config.env.PUBLIC_WEB_URL}/api/v1/auth/oauth/${id}/callback`;
  }

  /** Returns the provider authorize URL and the state value to bind to the browser cookie. */
  async start(id: string, returnTo = '/') {
    const provider = this.provider(id);
    const state = randomToken(24);
    const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
    await this.redis.set(
      `oauth:state:${state}`,
      JSON.stringify({ provider: id, returnTo: safeReturn }),
      'EX',
      STATE_TTL_SEC,
    );
    const url = new URL(provider.authorizeUrl);
    url.searchParams.set('client_id', provider.clientId!);
    url.searchParams.set('redirect_uri', this.redirectUri(id));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider.scope);
    url.searchParams.set('state', state);
    return { url: url.toString(), state };
  }

  /** Validates state (single use, must match the cookie) and exchanges the code for a user. */
  async complete(id: string, code: string, state: string, cookieState: string | undefined) {
    const provider = this.provider(id);
    if (!state || !cookieState || state !== cookieState) {
      throw Errors.badRequest('OAUTH_STATE_MISMATCH', 'OAuth state mismatch');
    }
    const raw = await this.redis.getdel(`oauth:state:${state}`);
    const stored = raw ? (JSON.parse(raw) as { provider: string; returnTo: string }) : null;
    if (!stored || stored.provider !== id) {
      throw Errors.badRequest('OAUTH_STATE_INVALID', 'OAuth state expired or invalid');
    }
    const accessToken = await this.exchange(provider, code);
    const profile = await this.fetchProfile(provider, accessToken);
    const userId = await this.linkOrCreate(provider.id, profile);
    return { userId, returnTo: stored.returnTo };
  }

  private async exchange(provider: OAuthProviderConfig, code: string): Promise<string> {
    const res = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: provider.clientId!,
        client_secret: provider.clientSecret!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri(provider.id),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string };
    if (!res.ok || !body.access_token)
      throw Errors.badRequest('OAUTH_EXCHANGE_FAILED', 'Could not complete sign-in');
    return body.access_token;
  }

  private async fetchProfile(provider: OAuthProviderConfig, token: string): Promise<OAuthProfile> {
    const headers = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': 'jandi-moviehub',
    };
    if (provider.id === 'github') {
      const user = (await (await fetch('https://api.github.com/user', { headers })).json()) as {
        id: number;
        login: string;
        name: string | null;
      };
      const emails = (await (
        await fetch('https://api.github.com/user/emails', { headers })
      ).json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary) : undefined;
      return {
        providerAccountId: String(user.id),
        email: primary?.email.toLowerCase() ?? null,
        emailVerified: !!primary?.verified,
        name: user.name ?? user.login,
        username: user.login,
      };
    }
    const info = (await (
      await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers })
    ).json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    return {
      providerAccountId: info.sub,
      email: info.email?.toLowerCase() ?? null,
      emailVerified: !!info.email_verified,
      name: info.name ?? 'Movie fan',
      username: (info.email ?? 'fan').split('@')[0]!,
    };
  }

  private async linkOrCreate(providerId: string, profile: OAuthProfile): Promise<string> {
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: providerId,
          providerAccountId: profile.providerAccountId,
        },
      },
    });
    if (existing) return existing.userId;
    // Only link to an existing account by email when the provider verified that email.
    if (profile.email && profile.emailVerified) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (byEmail) {
        await this.prisma.oAuthAccount.create({
          data: {
            userId: byEmail.id,
            provider: providerId,
            providerAccountId: profile.providerAccountId,
          },
        });
        return byEmail.id;
      }
    }
    const base =
      profile.username
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 16) || 'fan';
    const username = `${base}_${randomToken(3)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, 'x')}`.slice(0, 24);
    const user = await this.prisma.user.create({
      data: {
        email: profile.emailVerified ? profile.email : null,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        username,
        profile: { create: { displayName: profile.name.slice(0, 40) } },
        oauthAccounts: {
          create: { provider: providerId, providerAccountId: profile.providerAccountId },
        },
        watchlists: { create: { name: 'My Watchlist', isDefault: true } },
      },
    });
    return user.id;
  }
}
