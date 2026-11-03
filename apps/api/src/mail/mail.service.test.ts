import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/app-config';
import { loadEnv } from '../config/env';
import { MailService } from './mail.service';

const base = {
  DATABASE_URL: 'postgresql://localhost/test',
  MEDIA_SIGNING_SECRET: 'unit-test-secret-at-least-32-characters',
  MAIL_TRANSPORT: 'resend',
  RESEND_API_KEY: 'test-api-key',
  MAIL_FROM: 'Jandi MovieHub <onboarding@resend.dev>',
};
const message = {
  to: 'owner@example.com',
  subject: 'Verify email',
  text: 'Test verification link',
};
const service = () => new MailService({ env: loadEnv(base) } as AppConfig);

afterEach(() => vi.unstubAllGlobals());

describe('Resend email delivery', () => {
  it('delivers verification messages over HTTPS with server-side authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'email-id' }));
    vi.stubGlobal('fetch', fetchMock);
    await service().send(message);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-api-key');
    expect(JSON.parse(options.body)).toEqual({ from: base.MAIL_FROM, ...message });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([403, 429, 500])(
    'reports HTTP %s failures without exposing provider details',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('private provider error', { status })),
      );
      await expect(service().send(message)).rejects.toMatchObject({
        status: 503,
        code: 'EMAIL_DELIVERY_FAILED',
      });
    },
  );

  it('reports network timeouts as delivery failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')));
    await expect(service().send(message)).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
  });

  it('rejects a malformed success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})));
    await expect(service().send(message)).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
  });

  it('requires a Resend key at startup and accepts Resend in production', () => {
    expect(() => loadEnv({ ...base, RESEND_API_KEY: '' })).toThrow('RESEND_API_KEY');
    expect(loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).MAIL_TRANSPORT).toBe(
      'resend',
    );
    expect(() => loadEnv({ ...base, MAIL_TRANSPORT: 'dev', NODE_ENV: 'production' })).toThrow(
      'dev mail transport is not allowed in production',
    );
  });
});
