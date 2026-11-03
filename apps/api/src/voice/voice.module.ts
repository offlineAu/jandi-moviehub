import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({ imports: [RoomsModule], controllers: [VoiceController], providers: [VoiceService] })
export class VoiceModule {}
