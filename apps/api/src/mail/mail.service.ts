import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import nodemailer from 'nodemailer';
import { AppConfig } from '../config/app-config';
import { Errors } from '../common/errors';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface StoredMail extends MailMessage {
  id: string;
  from: string;
  sentAt: string;
}

/** A provider failure. `reason` is safe to log: it never contains addresses or message bodies. */
export class MailDeliveryError extends Error {
  constructor(
    readonly reason: string,
    readonly retryable: boolean,
  ) {
    super(`Email delivery failed: ${reason}`);
  }
}

interface MailTransport {
  readonly name: 'dev' | 'smtp' | 'resend';
  deliver(message: MailMessage, from: string): Promise<void>;
}

class ResendTransport implements MailTransport {
  readonly name = 'resend';
  constructor(private readonly apiKey: string) {}

  async deliver(message: MailMessage, from: string) {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, ...message }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === 'TimeoutError';
      throw new MailDeliveryError(timeout ? 'resend timeout' : 'resend network error', true);
    }
    if (!response.ok) {
      // Resend's `message` can quote the account owner's address, so only its `name` is kept.
      const body = (await response.json().catch(() => null)) as { name?: unknown } | null;
      const name = typeof body?.name === 'string' ? body.name.replace(/[^\w-]/g, '') : 'unknown';
      throw new MailDeliveryError(
        `resend HTTP ${response.status} (${name})`,
        response.status === 429 || response.status >= 500,
      );
    }
    const result = (await response.json().catch(() => null)) as { id?: unknown } | null;
    if (!result?.id) throw new MailDeliveryError('resend returned no message id', false);
  }
}

class SmtpTransport implements MailTransport {
  readonly name = 'smtp';
  private readonly transporter;
  constructor(url: string) {
    this.transporter = nodemailer.createTransport(url);
  }

  async deliver(message: MailMessage, from: string) {
    try {
      await this.transporter.sendMail({ from, ...message });
    } catch (error) {
      const details = (error ?? {}) as { responseCode?: number; code?: string };
      const status = details.responseCode;
      // SMTP 4xx = temporary, 5xx = permanent; no response code = connection-level failure.
      throw new MailDeliveryError(
        `smtp ${status ?? String(details.code ?? 'error').replace(/[^\w-]/g, '')}`,
        status === undefined || status < 500,
      );
    }
  }
}

/** Development only: writes each message as JSON so flows are testable without credentials. */
class DevTransport implements MailTransport {
  readonly name = 'dev';
  private readonly logger = new Logger('DevMail');
  constructor(private readonly dir: string) {}

  async deliver(message: MailMessage, from: string) {
    await mkdir(this.dir, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const stored: StoredMail = { id, from, sentAt: new Date().toISOString(), ...message };
    await writeFile(join(this.dir, `${id}.json`), JSON.stringify(stored, null, 2));
    this.logger.log(`"${message.subject}" → ${message.to} (stored as ${id}.json)`);
  }
}

/**
 * The single way the API sends email. Picks a transport from MAIL_TRANSPORT (dev / smtp /
 * resend; dev is refused in production by env validation) and retries temporary failures.
 *
 * Two entry points, chosen by whether the caller's request depends on the email:
 * - `send` throws EMAIL_DELIVERY_FAILED (503) — for actions whose only purpose is the email,
 *   like "resend verification".
 * - `trySend` never throws and reports success — for actions that must complete regardless,
 *   like registration, or must not reveal whether an account exists, like password reset.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: MailTransport;
  /** Waits before each retry of a temporary failure (overridable in tests). */
  retryDelaysMs = [400, 1_500];

  constructor(private readonly config: AppConfig) {
    const env = config.env;
    if (env.MAIL_TRANSPORT === 'resend') this.transport = new ResendTransport(env.RESEND_API_KEY!);
    else if (env.MAIL_TRANSPORT === 'smtp') this.transport = new SmtpTransport(env.SMTP_URL!);
    else this.transport = new DevTransport(config.devMailDir);

    if (env.MAIL_TRANSPORT === 'resend' && /@resend\.dev>?\s*$/i.test(env.MAIL_FROM)) {
      this.logger.warn(
        'MAIL_FROM uses resend.dev: Resend only delivers it to the Resend account owner. ' +
          'Verify a sending domain in Resend and set MAIL_FROM to an address on it.',
      );
    }
  }

  get mode() {
    return this.transport.name;
  }

  async send(message: MailMessage, kind = 'transactional'): Promise<void> {
    if (!(await this.trySend(message, kind))) {
      throw Errors.unavailable(
        'EMAIL_DELIVERY_FAILED',
        'Email could not be sent. Try again later.',
      );
    }
  }

  async trySend(message: MailMessage, kind = 'transactional'): Promise<boolean> {
    const from = this.config.env.MAIL_FROM;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.transport.deliver(message, from);
        return true;
      } catch (error) {
        const failure =
          error instanceof MailDeliveryError
            ? error
            : new MailDeliveryError(`${this.transport.name} unexpected error`, false);
        const delay = this.retryDelaysMs[attempt];
        if (failure.retryable && delay !== undefined) {
          await sleep(delay);
          continue;
        }
        this.logger.warn(
          `Could not deliver ${kind} email after ${attempt + 1} attempt(s): ${failure.reason}`,
        );
        return false;
      }
    }
  }

  /** Dev-only: most recent stored messages, optionally filtered by recipient. */
  async listDev(to?: string, limit = 20): Promise<StoredMail[]> {
    const dir = this.config.devMailDir;
    const files = await readdir(dir).catch(() => [] as string[]);
    const recent = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    const out: StoredMail[] = [];
    for (const file of recent) {
      const mail = JSON.parse(await readFile(join(dir, file), 'utf8')) as StoredMail;
      if (!to || mail.to.toLowerCase() === to.toLowerCase()) out.push(mail);
      if (out.length >= limit) break;
    }
    return out;
  }
}
