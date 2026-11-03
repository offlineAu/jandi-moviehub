import { Module } from '@nestjs/common';
import { MediaResolver } from './media-resolver';
import { PlaybackService } from './playback.service';

@Module({ providers: [PlaybackService, MediaResolver], exports: [PlaybackService, MediaResolver] })
export class PlaybackModule {}
