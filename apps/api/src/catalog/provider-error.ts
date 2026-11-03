import { Logger } from '@nestjs/common';
import { Errors } from '../common/errors';

const logger = new Logger('PlaybackProvider');
const knownCodes = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

/** Log only fixed labels and recognized codes, never response bodies or signed URLs. */
export function providerFailure(provider: 'MovieBox' | 'KissKH', error: unknown, status?: number) {
  const value = error as { name?: string; code?: string; cause?: { code?: string } } | null;
  const raw = value?.cause?.code ?? value?.code;
  const reason = status
    ? `HTTP_${status}`
    : value?.name === 'TimeoutError' || value?.name === 'AbortError'
      ? 'TIMEOUT'
      : raw && knownCodes.has(raw)
        ? raw
        : 'REQUEST_FAILED';
  logger.warn({ provider, reason });
  const timeout = ['TIMEOUT', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(reason);
  const dns = ['ENOTFOUND', 'EAI_AGAIN'].includes(reason);
  const message = timeout
    ? `${provider} did not respond before the connection timed out. Try again later.`
    : dns
      ? `Jandi could not resolve the ${provider} server address.`
      : status
        ? `${provider} returned HTTP ${status}. The source is currently unavailable.`
        : `Jandi could not connect to ${provider}. The source is currently unavailable.`;
  return Errors.unavailable(`${provider.toUpperCase()}_${reason}`, message);
}
