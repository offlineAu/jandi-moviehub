import { MovieboxController, MovieboxService } from './moviebox.controller';
import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { CatalogController } from './catalog.controller';
import { SeriesController } from './series.controller';
import { CatalogService, MOVIE_PROVIDER } from './catalog.service';
import { MediaController } from './media.controller';
import { MediaSigner } from './media-signer';
import { LocalCatalogProvider } from './providers/local-catalog.provider';
import { TmdbClient } from './providers/tmdb.client';
import { TmdbProvider } from './providers/tmdb.provider';
import { TmdbTvProvider } from './providers/tmdb-tv.provider';
import { TvController } from './tv.controller';
import { TV_PROVIDER, TvMetadataService } from './tv.service';
import { AVAILABILITY_PROVIDER, AvailabilityController } from './availability.controller';
import { WatchmodeProvider } from './providers/watchmode.provider';
import { SavedTvController } from './saved-tv.controller';
import { RecentTvController } from './recent-tv.controller';
import { TvPlaybackController } from './tv-playback.controller';
import { BlenderFilmsController } from './blender-films.controller';
import { ExternalSeriesController, ExternalSeriesService } from './external-series.controller';

@Module({
  controllers: [
    CatalogController,
    SeriesController,
    MediaController,
    TvController,
    AvailabilityController,
    SavedTvController,
    RecentTvController,
    TvPlaybackController,
    BlenderFilmsController,
    ExternalSeriesController,
    MovieboxController,
  ],
  providers: [
    ExternalSeriesService,
    MovieboxService,
    LocalCatalogProvider,
    {
      provide: AVAILABILITY_PROVIDER,
      inject: [AppConfig, REDIS],
      useFactory: (config: AppConfig, redis: Redis) =>
        config.env.WATCHMODE_API_KEY
          ? new WatchmodeProvider(config.env.WATCHMODE_API_KEY, {
              get: (key) => redis.get(key),
              set: async (key, value, ttlSec) => {
                await redis.set(key, value, 'EX', ttlSec);
              },
            })
          : null,
    },
    {
      provide: TV_PROVIDER,
      inject: [AppConfig, REDIS],
      useFactory: (config: AppConfig, redis: Redis) => {
        if (!config.tmdbEnabled) return null;
        return new TmdbTvProvider(
          new TmdbClient({
            readToken: config.env.TMDB_READ_TOKEN,
            apiKey: config.env.TMDB_API_KEY,
            cacheTtlSec: config.env.TMDB_CACHE_TTL_SEC,
            cache: {
              get: (key) => redis.get(key),
              set: async (key, value, ttlSec) => {
                await redis.set(key, value, 'EX', ttlSec);
              },
            },
          }),
        );
      },
    },
    TvMetadataService,
    {
      provide: MediaSigner,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new MediaSigner(config.env.MEDIA_SIGNING_SECRET, config.env.MEDIA_URL_TTL_SEC),
    },
    {
      // TMDB when credentials are configured (CATALOG_PROVIDER=auto|tmdb), otherwise the local demo catalog.
      provide: MOVIE_PROVIDER,
      inject: [AppConfig, PrismaService, REDIS, LocalCatalogProvider],
      useFactory: (
        config: AppConfig,
        prisma: PrismaService,
        redis: Redis,
        local: LocalCatalogProvider,
      ) => {
        if (!config.tmdbEnabled) return local;
        const ttl = config.env.TMDB_CACHE_TTL_SEC;
        const client = new TmdbClient({
          readToken: config.env.TMDB_READ_TOKEN,
          apiKey: config.env.TMDB_API_KEY,
          cacheTtlSec: ttl,
          cache: {
            get: (key) => redis.get(key),
            set: async (key, value, ttlSec) => {
              await redis.set(key, value, 'EX', ttlSec);
            },
          },
        });
        return new TmdbProvider(prisma, client, ttl, local);
      },
    },
    CatalogService,
  ],
  exports: [
    ExternalSeriesService,
    MovieboxService,
    TvMetadataService,
    CatalogService,
    MediaSigner,
    LocalCatalogProvider,
  ],
})
export class CatalogModule {}
