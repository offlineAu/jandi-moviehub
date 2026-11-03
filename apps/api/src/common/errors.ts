import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

/** HTTP error with a stable machine-readable code. */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ error: { code, message, details } }, status);
  }
}

export const Errors = {
  badRequest: (code: string, message: string, details?: unknown) =>
    new AppError(HttpStatus.BAD_REQUEST, code, message, details),
  unauthorized: (message = 'Authentication required') =>
    new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have permission to do that', code = 'FORBIDDEN') =>
    new AppError(HttpStatus.FORBIDDEN, code, message),
  notFound: (what = 'Resource') =>
    new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`),
  conflict: (code: string, message: string) => new AppError(HttpStatus.CONFLICT, code, message),
  tooMany: (retryAfterSec: number) =>
    new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many requests, slow down', {
      retryAfterSec,
    }),
  unavailable: (code: string, message: string) =>
    new AppError(HttpStatus.SERVICE_UNAVAILABLE, code, message),
};
