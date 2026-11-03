import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env';

/** Structured JSON logs with request ids; credentials and cookies are always redacted. */
export function loggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req: IncomingMessage) => {
        const header = req.headers['x-request-id'];
        return typeof header === 'string' && /^[\w-]{8,64}$/.test(header) ? header : randomUUID();
      },
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.currentPassword',
          '*.newPassword',
        ],
        censor: '[REDACTED]',
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          // Strip query strings: they can carry tokens (reset links, signed media URLs).
          url: req.url?.split('?')[0],
        }),
      },
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
          : undefined,
    },
  };
}
