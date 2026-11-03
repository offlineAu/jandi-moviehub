import { Global, Module } from '@nestjs/common';
import { TimerQueue } from './timer-queue.service';

@Global()
@Module({ providers: [TimerQueue], exports: [TimerQueue] })
export class QueueModule {}
