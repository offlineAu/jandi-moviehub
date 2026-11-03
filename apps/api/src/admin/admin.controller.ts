import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  adminLicenseSchema,
  adminMediaAssetSchema,
  adminMediaStatusSchema,
  adminMovieSchema,
  adminUserUpdateSchema,
  appSettingSchema,
  resolveReportSchema,
} from '@jandi/shared';
import type { Request } from 'express';
import { tmpdir } from 'node:os';
import type { z } from 'zod';
import {
  type AuthUser,
  clientIp,
  CurrentUser,
  Public,
  RateLimit,
  Roles,
} from '../common/auth-context';
import { ValidBody, ValidQuery } from '../common/zod';
import { ReportsService, type ResolveReportInput } from '../reports/reports.service';
import { type AdminMediaAssetInput, AdminCatalogService } from './admin-catalog.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminStatsService } from './admin-stats.service';
import { type AdminUserUpdate, AdminUsersService } from './admin-users.service';
import {
  type AdminAuditQuery,
  adminAuditQuerySchema,
  type AdminLicenseInput,
  type AdminLicensePatch,
  adminLicensePatchSchema,
  type AdminLicenseQuery,
  adminLicenseQuerySchema,
  type AdminMediaQuery,
  adminMediaQuerySchema,
  type AdminMovieInput,
  type AdminMoviePatch,
  adminMoviePatchSchema,
  type AdminMovieQuery,
  adminMovieQuerySchema,
  adminReportQuerySchema,
  type AdminRoomQuery,
  adminRoomQuerySchema,
  type AdminUserQuery,
  adminUserQuerySchema,
  analyticsQuerySchema,
} from './admin.schemas';
import { SettingsService } from './settings.service';
import { MEDIA_UPLOAD_MAX_BYTES } from './video-sniff';

/*
 * Every controller here is ADMIN-only at class level. Routes that moderators may use
 * override it with a method-level @Roles('MODERATOR') (ADMIN implicitly satisfies MODERATOR).
 */

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get('overview')
  overview() {
    return this.stats.overview();
  }

  @Get('analytics')
  analytics(@ValidQuery(analyticsQuerySchema) q: z.infer<typeof analyticsQuerySchema>) {
    return this.stats.analytics(q.days);
  }

  @Get('sync-stats')
  syncStats() {
    return this.stats.syncStats();
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@ValidQuery(adminUserQuerySchema) q: AdminUserQuery) {
    return this.users.list(q);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(adminUserUpdateSchema) body: AdminUserUpdate,
    @Req() req: Request,
  ) {
    return { user: await this.users.update(actor, id, body, clientIp(req)) };
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  // ── Movies ──
  @Get('movies')
  movies(@ValidQuery(adminMovieQuerySchema) q: AdminMovieQuery) {
    return this.catalog.listMovies(q);
  }

  @Post('movies')
  async createMovie(
    @CurrentUser() actor: AuthUser,
    @ValidBody(adminMovieSchema) body: AdminMovieInput,
    @Req() req: Request,
  ) {
    return { movie: await this.catalog.createMovie(actor, body, clientIp(req)) };
  }

  @Patch('movies/:id')
  async updateMovie(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(adminMoviePatchSchema) body: AdminMoviePatch,
    @Req() req: Request,
  ) {
    return { movie: await this.catalog.updateMovie(actor, id, body, clientIp(req)) };
  }

  @HttpCode(204)
  @Delete('movies/:id')
  async deleteMovie(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.catalog.deleteMovie(actor, id, clientIp(req));
  }

  // ── Licenses ──
  @Get('licenses')
  licenses(@ValidQuery(adminLicenseQuerySchema) q: AdminLicenseQuery) {
    return this.catalog.listLicenses(q);
  }

  @Post('licenses')
  async createLicense(
    @CurrentUser() actor: AuthUser,
    @ValidBody(adminLicenseSchema) body: AdminLicenseInput,
    @Req() req: Request,
  ) {
    return { license: await this.catalog.createLicense(actor, body, clientIp(req)) };
  }

  @Patch('licenses/:id')
  async updateLicense(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(adminLicensePatchSchema) body: AdminLicensePatch,
    @Req() req: Request,
  ) {
    return { license: await this.catalog.updateLicense(actor, id, body, clientIp(req)) };
  }

  @HttpCode(200)
  @Post('licenses/:id/verify')
  async verify(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return { license: await this.catalog.setLicenseVerified(actor, id, true, clientIp(req)) };
  }

  @HttpCode(200)
  @Post('licenses/:id/unverify')
  async unverify(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return { license: await this.catalog.setLicenseVerified(actor, id, false, clientIp(req)) };
  }

  // ── Media assets ──
  @Get('media')
  media(@ValidQuery(adminMediaQuerySchema) q: AdminMediaQuery) {
    return this.catalog.listMedia(q);
  }

  @Post('media')
  async registerMedia(
    @CurrentUser() actor: AuthUser,
    @ValidBody(adminMediaAssetSchema) body: AdminMediaAssetInput,
    @Req() req: Request,
  ) {
    return { asset: await this.catalog.registerMedia(actor, body, clientIp(req)) };
  }

  @RateLimit({ name: 'admin:media-upload', limit: 30, windowSec: 3600, by: 'user' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    // Streamed to a temp file (never buffered in memory); magic bytes are checked before it is kept.
    FileInterceptor('file', {
      dest: tmpdir(),
      limits: { fileSize: MEDIA_UPLOAD_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  @Post('media/upload')
  async upload(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file: { path: string; size: number } | undefined,
    @Req() req: Request,
  ) {
    return { upload: await this.catalog.storeUpload(actor, file, clientIp(req)) };
  }

  @Patch('media/:id/status')
  async mediaStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(adminMediaStatusSchema) body: z.infer<typeof adminMediaStatusSchema>,
    @Req() req: Request,
  ) {
    return { asset: await this.catalog.setMediaStatus(actor, id, body.status, clientIp(req)) };
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminModerationController {
  constructor(
    private readonly moderation: AdminModerationService,
    private readonly reports: ReportsService,
  ) {}

  @Roles('MODERATOR')
  @Get('rooms')
  rooms(@ValidQuery(adminRoomQuerySchema) q: AdminRoomQuery) {
    return this.moderation.listRooms(q);
  }

  @Roles('MODERATOR')
  @HttpCode(204)
  @Post('rooms/:id/close')
  async closeRoom(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.moderation.closeRoom(actor, id, clientIp(req));
  }

  @Roles('MODERATOR')
  @HttpCode(204)
  @Delete('messages/:id')
  async deleteMessage(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.moderation.deleteMessage(actor, id, clientIp(req));
  }

  @Roles('MODERATOR')
  @Get('reports')
  listReports(@ValidQuery(adminReportQuerySchema) q: z.infer<typeof adminReportQuerySchema>) {
    return this.reports.adminList(q);
  }

  @Roles('MODERATOR')
  @Patch('reports/:id')
  async resolveReport(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidBody(resolveReportSchema) body: ResolveReportInput,
    @Req() req: Request,
  ) {
    return { report: await this.reports.resolve(actor, id, body, clientIp(req)) };
  }

  @Roles('MODERATOR')
  @Get('audit')
  audit(@ValidQuery(adminAuditQuerySchema) q: AdminAuditQuery) {
    return this.moderation.listAudit(q);
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Put(':key')
  set(
    @CurrentUser() actor: AuthUser,
    @Param('key') key: string,
    @ValidBody(appSettingSchema) body: z.infer<typeof appSettingSchema>,
    @Req() req: Request,
  ) {
    return this.settings.set(actor, key, body.value, clientIp(req));
  }
}

/** Unauthenticated subset of settings the web app needs before login. */
@ApiTags('settings')
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('public')
  publicSettings() {
    return this.settings.publicSettings();
  }
}
