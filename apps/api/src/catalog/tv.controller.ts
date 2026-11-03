import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, RateLimit } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidQuery } from '../common/zod';
import { TvMetadataService } from './tv.service';

const idSchema = z.coerce.number().int().positive().max(2147483647);
const seasonSchema = z.coerce.number().int().min(0).max(9999);
function parameter(schema: typeof idSchema, value: string) {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.badRequest('INVALID_PARAMETER', 'Invalid TV identifier');
  return result.data;
}
@ApiTags('TV metadata')
@Controller('tv')
export class TvController {
  constructor(private readonly tv: TvMetadataService) {}
  @Public()
  @Get('genres')
  genres() {
    return this.tv.genres();
  }
  @Public()
  @RateLimit({ name: 'tv:genre', limit: 120, windowSec: 60 })
  @Get('discover')
  discover(
    @ValidQuery(
      z.object({
        genre: z.string().regex(/^[a-z0-9-]{1,100}$/),
        page: z.coerce.number().int().min(1).max(500).default(1),
      }),
    )
    query: {
      genre: string;
      page: number;
    },
  ) {
    return this.tv.byGenre(query.genre, query.page);
  }
  @Public()
  @RateLimit({ name: 'tv:popular', limit: 120, windowSec: 60 })
  @Get('popular')
  popular(
    @ValidQuery(z.object({ page: z.coerce.number().int().min(1).max(500).default(1) }))
    query: {
      page: number;
    },
  ) {
    return this.tv.popular(query.page);
  }
  @Public()
  @RateLimit({ name: 'tv:search', limit: 120, windowSec: 60 })
  @Get('search')
  search(
    @ValidQuery(
      z.object({
        q: z.string().trim().min(2).max(100),
        page: z.coerce.number().int().min(1).max(500).default(1),
      }),
    )
    q: {
      q: string;
      page: number;
    },
  ) {
    return this.tv.search(q.q, q.page);
  }
  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.tv.detail(parameter(idSchema, id));
  }
  @Public()
  @Get(':id/seasons/:season')
  season(@Param('id') id: string, @Param('season') season: string) {
    return this.tv.season(parameter(idSchema, id), parameter(seasonSchema, season));
  }
  @Public()
  @Get(':id/seasons/:season/episodes/:episode')
  episode(
    @Param('id') id: string,
    @Param('season') season: string,
    @Param('episode') episode: string,
  ) {
    return this.tv.episode(
      parameter(idSchema, id),
      parameter(seasonSchema, season),
      parameter(seasonSchema, episode),
    );
  }
}
