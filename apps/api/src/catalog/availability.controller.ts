import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, RateLimit } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidQuery } from '../common/zod';
import type { WatchmodeProvider } from './providers/watchmode.provider';

export const AVAILABILITY_PROVIDER = Symbol('AVAILABILITY_PROVIDER');
@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(@Inject(AVAILABILITY_PROVIDER) private readonly provider: WatchmodeProvider | null) {}
  @Public()
  @RateLimit({ name: 'availability', limit: 60, windowSec: 60 })
  @Get(':kind/:id')
  async list(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @ValidQuery(
      z.object({
        region: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .transform((v) => v.toUpperCase())
          .default('PH'),
      }),
    )
    query: { region: string },
  ) {
    const n = z.coerce.number().int().positive().max(2147483647).safeParse(id);
    if (!n.success || (kind !== 'movie' && kind !== 'tv'))
      throw Errors.badRequest('INVALID_PARAMETER', 'Invalid title identifier');
    if (!this.provider)
      throw Errors.unavailable(
        'AVAILABILITY_NOT_CONFIGURED',
        'Viewing availability is not configured.',
      );
    return {
      items: await this.provider.sources(kind, n.data, query.region),
      region: query.region,
      attribution: 'Powered by Watchmode',
      attributionUrl: 'https://www.watchmode.com/',
    };
  }
}
