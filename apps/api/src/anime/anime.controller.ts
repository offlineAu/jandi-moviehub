import { Controller, Get, Post, Param, ParseUUIDPipe, Header, HttpCode } from '@nestjs/common';
import { z } from 'zod';
import { AllowGuest, Public, RateLimit, CurrentUser, type AuthUser } from '../common/auth-context';
import { ValidQuery, ValidBody } from '../common/zod';
import { AnimeService } from './anime.service';
@Controller('anime')
export class AnimeController {
  constructor(private readonly anime: AnimeService) {}
  @Public()
  @Get()
  @RateLimit({ name: 'anime:search', limit: 60, windowSec: 60 })
  search(
    @ValidQuery(
      z.object({
        q: z.string().trim().max(120).default(''),
        page: z.coerce.number().int().min(1).max(1000).default(1),
      }),
    )
    query: {
      q: string;
      page: number;
    },
  ) {
    return this.anime.search(query.q, query.page);
  }
  @Public()
  @Get(':id/episodes')
  @RateLimit({ name: 'anime:episodes', limit: 60, windowSec: 60 })
  episodes(@Param('id', ParseUUIDPipe) id: string) {
    return this.anime.episodes(id);
  }
  @AllowGuest()
  @Get('sources/:id/navigation')
  @RateLimit({ name: 'anime:navigation', limit: 60, windowSec: 60, by: 'user' })
  navigation(@Param('id', ParseUUIDPipe) id: string) {
    return this.anime.navigation(id);
  }
  @AllowGuest()
  @Get('sources/:id')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ name: 'anime:playback', limit: 60, windowSec: 60, by: 'user' })
  playback(@Param('id', ParseUUIDPipe) id: string) {
    return this.anime.playback(id);
  }
  @AllowGuest()
  @Post('sources/:id/events')
  @HttpCode(204)
  @RateLimit({ name: 'anime:events', limit: 30, windowSec: 60, by: 'user' })
  record(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @ValidBody(
      z
        .object({
          event: z.enum(['started', 'failed']),
          device: z.enum(['ios', 'android', 'desktop', 'other']),
        })
        .strict(),
    )
    body: { event: 'started' | 'failed'; device: string },
  ) {
    return this.anime.record(id, body.event, body.device, user.id);
  }
}
