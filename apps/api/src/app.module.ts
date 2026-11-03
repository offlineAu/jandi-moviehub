import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AuthGuard, OriginGuard, RateLimitGuard } from './common/guards';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { loadEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { loggerParams } from './observability/logging';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { SettingsModule } from './admin/settings.module';
import { RealtimeEmitterModule } from './realtime/emitter';
import { StorageModule } from './storage/storage.module';
import { CatalogModule } from './catalog/catalog.module';
import { LibraryModule } from './library/library.module';
import { UsersModule } from './users/users.module';
import { RoomsModule } from './rooms/rooms.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ChatModule } from './chat/chat.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { MarathonModule } from './marathon/marathon.module';
import { SocialModule } from './social/social.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ useFactory: () => loggerParams(loadEnv()) }),
    PrismaModule,
    RedisModule,
    CommonModule,
    QueueModule,
    SettingsModule,
    RealtimeEmitterModule,
    MailModule,
    AuthModule,
    HealthModule,
    StorageModule,
    CatalogModule,
    LibraryModule,
    UsersModule,
    RoomsModule,
    RealtimeModule,
    ChatModule,
    PlaylistsModule,
    MarathonModule,
    SocialModule,
    NotificationsModule,
    ReportsModule,
    AdminModule,
    VoiceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {
  constructor(readonly config: AppConfig) {}
}
