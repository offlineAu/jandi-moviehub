import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReportsModule } from '../reports/reports.module';
import { RoomsModule } from '../rooms/rooms.module';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminCatalogController,
  AdminModerationController,
  AdminSettingsController,
  AdminStatsController,
  AdminUsersController,
  PublicSettingsController,
} from './admin.controller';

@Module({
  imports: [RoomsModule, ChatModule, RealtimeModule, ReportsModule],
  controllers: [
    AdminStatsController,
    AdminUsersController,
    AdminCatalogController,
    AdminModerationController,
    AdminSettingsController,
    PublicSettingsController,
  ],
  providers: [AdminStatsService, AdminUsersService, AdminCatalogService, AdminModerationService],
})
export class AdminModule {}
