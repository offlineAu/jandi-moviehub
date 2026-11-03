import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
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

/**
 * Sends email over SMTP or Resend's HTTPS API. In development the "dev" transport writes
 * each message as JSON under DEV_MAIL_DIR so flows (reset, verification) are testable
 * without credentials. The dev transport is rejected by env validation in production.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: AppConfig) {
    if (config.env.MAIL_TRANSPORT === 'smtp' && config.env.SMTP_URL) {
      this.transporter = nodemailer.createTransport(config.env.SMTP_URL);
    }
  }

  get mode() {
    return this.config.env.MAIL_TRANSPORT;
  }

  async send(message: MailMessage): Promise<void> {
    const from = this.config.env.MAIL_FROM;
    if (this.mode === 'resend') {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, ...message }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          // Do not log response bodies: they can include addresses or message content.
          this.logger.warn(`Resend rejected email delivery (HTTP ${response.status})`);
          throw new Error('Email provider rejected the request');
        }
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object' || !('id' in result) || !result.id) {
          throw new Error('Invalid email provider response');
        }
      } catch {
        throw Errors.unavailable(
          'EMAIL_DELIVERY_FAILED',
          'Email could not be sent. Try again later.',
        );
      }
      return;
    }
    if (this.transporter) {
      await this.transporter.sendMail({ from, ...message });
      return;
    }
    const dir = this.config.devMailDir;
    await mkdir(dir, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const stored: StoredMail = { id, from, sentAt: new Date().toISOString(), ...message };
    await writeFile(join(dir, `${id}.json`), JSON.stringify(stored, null, 2));
    this.logger.log(`[dev mail] "${message.subject}" → ${message.to} (stored as ${id}.json)`);
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
