import { describe, expect, it, vi, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { providerFailure } from './provider-error';
afterEach(() => vi.restoreAllMocks());
describe('provider diagnostics', () => {
  it.each([
    [{ name: 'TimeoutError' }, 'TIMEOUT'],
    [{ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }, 'UND_ERR_CONNECT_TIMEOUT'],
    [{ cause: { code: 'ENOTFOUND' } }, 'ENOTFOUND'],
  ])('identifies transport errors without leaking URLs', (error, reason) => {
    const log = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const result = providerFailure('MovieBox', {
      ...error,
      message: 'https://private/?token=secret',
    });
    expect(result.code).toBe(`MOVIEBOX_${reason}`);
    expect(log).toHaveBeenCalledWith({ provider: 'MovieBox', reason });
    expect(JSON.stringify(result.getResponse())).not.toContain('secret');
  });
  it('preserves an upstream HTTP failure separately from transport failures', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    expect(providerFailure('KissKH', null, 403).code).toBe('KISSKH_HTTP_403');
  });
});
