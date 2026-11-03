import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

/**
 * Error reporting adapter. Always logs; additionally POSTs a JSON summary to
 * ERROR_WEBHOOK_URL (e.g. a Sentry/Slack relay) when configured.
 */
@Injectable()
export class ErrorReporter {
  private readonly logger = new Logger('ErrorReporter');

  constructor(private readonly config: AppConfig) {}

  report(error: unknown, context: Record<string, unknown> = {}) {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger.error({ err, ...context }, err.message);
    const url = this.config.env.ERROR_WEBHOOK_URL;
    if (!url) return;
    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service: 'jandi-api',
        environment: this.config.env.NODE_ENV,
        message: err.message,
        name: err.name,
        stack: err.stack?.split('\n').slice(0, 15).join('\n'),
        context,
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(3000),
    }).catch((e: unknown) => this.logger.warn(`Error webhook failed: ${String(e)}`));
  }
}
