import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createReportSchema, paginationSchema, type PaginationQuery } from '@jandi/shared';
import { type AuthUser, CurrentUser, RateLimit } from '../common/auth-context';
import { ValidBody, ValidQuery } from '../common/zod';
import { type CreateReportInput, ReportsService } from './reports.service';

/** User-facing reporting. Guests are rejected by the default auth policy. */
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RateLimit({ name: 'reports:create', limit: 10, windowSec: 3600, by: 'user' })
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @ValidBody(createReportSchema) body: CreateReportInput,
  ) {
    return { report: await this.reports.create(user, body) };
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @ValidQuery(paginationSchema) q: PaginationQuery) {
    return this.reports.listMine(user, q.page, q.pageSize);
  }
}
