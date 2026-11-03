import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/auth-context';
import { Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';
import { MailService } from './mail.service';

/** Development-only mailbox viewer. Disabled unless ENABLE_DEV_ROUTES=true and not production. */
@ApiExcludeController()
@Controller('dev/mail')
export class DevMailController {
  constructor(
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  async list(@Query('to') to?: string) {
    if (!this.config.devRoutesEnabled || this.mail.mode !== 'dev') throw Errors.notFound('Route');
    return { items: await this.mail.listDev(to) };
  }
}
