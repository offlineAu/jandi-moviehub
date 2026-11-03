import { Global, Module } from '@nestjs/common';
import { DevMailController } from './dev-mail.controller';
import { MailService } from './mail.service';

@Global()
@Module({ providers: [MailService], exports: [MailService], controllers: [DevMailController] })
export class MailModule {}
