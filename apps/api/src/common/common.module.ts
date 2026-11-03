import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ErrorReporter } from './error-reporter';
import { RateLimiterService } from './rate-limiter.service';

@Global()
@Module({
  providers: [RateLimiterService, AuditService, ErrorReporter],
  exports: [RateLimiterService, AuditService, ErrorReporter],
})
export class CommonModule {}
