import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { AuthedRequest } from './auth-context';
import { ErrorReporter } from './error-reporter';
import { AppError, type ErrorBody } from './errors';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

/** Converts every error into the standard `{ error: { code, message, details }, requestId }` shape. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly reporter: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AuthedRequest & { id?: string }>();
    const requestId = typeof req.id === 'string' ? req.id : undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (
        typeof response === 'object' &&
        response &&
        'error' in response &&
        typeof response.error === 'object'
      ) {
        body = response as ErrorBody;
      } else {
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string | string[] }).message ?? exception.message);
        body = {
          error: {
            code: STATUS_CODES[status] ?? 'HTTP_ERROR',
            message: Array.isArray(message) ? message.join(', ') : String(message),
          },
        };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = { error: { code: 'CONFLICT', message: 'That already exists' } };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { error: { code: 'NOT_FOUND', message: 'Resource not found' } };
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        body = {
          error: { code: 'INVALID_REFERENCE', message: 'A referenced record does not exist' },
        };
      }
    }

    // Expected, app-coded unavailability (e.g. VOICE_NOT_CONFIGURED) is not an error to report.
    const expected = exception instanceof AppError && status === HttpStatus.SERVICE_UNAVAILABLE;
    if (status >= 500 && !expected) {
      this.reporter.report(exception, {
        requestId,
        method: req.method,
        path: req.path,
        userId: req.user?.id,
      });
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const retry = (body.error.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
      if (retry) res.setHeader('Retry-After', String(retry));
    }
    res.status(status).json({ ...body, requestId });
  }
}
