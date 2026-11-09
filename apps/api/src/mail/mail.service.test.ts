import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/app-config';
import { loadEnv } from '../config/env';
import { MailService } from './mail.service';
import { escapeHtml, mailTemplates } from './templates';

const base = {
  DATABASE_URL: 'postgresql://localhost/test',
  MEDIA_SIGNING_SECRET: 'unit-test-secret-at-least-32-characters',
  MAIL_TRANSPORT: 'resend',
  RESEND_API_KEY: 'test-api-key',
  MAIL_FROM: 'Jandi MovieHub <no-reply@mail.example.com>',
};
const message = {
  to: 'owner@example.com',
  subject: 'Verify email',
  text: 'Test verification link',
};
const service = (overrides: Record<string, string> = {}) => {
  const s = new MailService({ env: loadEnv({ ...base, ...overrides }) } as AppConfig);
  s.retryDelaysMs = [0, 0];
  return s;
};
const resendError = (status: number, name: string) =>
  Response.json(
    { statusCode: status, name, message: 'You can only send testing emails to owner@x.com' },
    { status },
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Resend email delivery', () => {
  it('delivers messages over HTTPS with server-side authentication', async () => {
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

  it('does not retry permanent rejections and logs only the error name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resendError(403, 'validation_error'));
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(service().send(message)).rejects.toMatchObject({
      status: 503,
      code: 'EMAIL_DELIVERY_FAILED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain('resend HTTP 403 (validation_error)');
    expect(logged).not.toContain('@');
  });

  it.each([429, 500])('retries HTTP %s and succeeds when the provider recovers', async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resendError(status, 'rate_limit_exceeded'))
      .mockResolvedValueOnce(Response.json({ id: 'email-id' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(service().trySend(message)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts on persistent temporary failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(service().trySend(message)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects a malformed success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})));
    await expect(service().send(message)).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
  });

  it('trySend never throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })));
    await expect(service().trySend(message)).resolves.toBe(false);
  });

  it('warns at startup when the sender is the resend.dev sandbox address', () => {
    const spy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service({ MAIL_FROM: 'Jandi MovieHub <onboarding@resend.dev>' });
    expect(String(spy.mock.calls[0]?.[0])).toContain('resend.dev');
    spy.mockClear();
    service();
    expect(spy).not.toHaveBeenCalled();
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

describe('mail templates', () => {
  it('renders verification mail with text and HTML bodies containing the link', () => {
    const link = 'https://jandi.example/verify-email?token=abc_123';
    const mail = mailTemplates.verifyEmail({ displayName: 'Film Fan', link, expiresInHours: 48 });
    expect(mail.subject).toBe('Verify your Jandi MovieHub email');
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('48 hours');
    expect(mail.html).toContain(`href="${link}"`);
  });

  it('escapes user-controlled values in HTML', () => {
    const mail = mailTemplates.verifyEmail({
      displayName: '<img src=x onerror=alert(1)>',
      link: 'https://jandi.example/verify-email?token=t&x="y"',
      expiresInHours: 48,
    });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mail.html).toContain('token=t&amp;x=&quot;y&quot;');
    expect(escapeHtml(`'`)).toBe('&#39;');
  });

  it('renders password reset mail with its expiry', () => {
    const mail = mailTemplates.passwordReset({
      link: 'https://j.example/r?token=z',
      expiresInMinutes: 60,
    });
    expect(mail.subject).toBe('Reset your Jandi MovieHub password');
    expect(mail.text).toContain('60 minutes');
    expect(mail.text).toContain('https://j.example/r?token=z');
  });
});
