import { CatalogModule } from '../catalog/catalog.module';
import { Module } from '@nestjs/common';
import { MediaResolver } from './media-resolver';
import { PlaybackService } from './playback.service';

@Module({
  imports: [CatalogModule],
  providers: [PlaybackService, MediaResolver],
  exports: [PlaybackService, MediaResolver],
})
export class PlaybackModule {}
