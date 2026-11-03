import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

/** Global so auth, rooms and chat can read app settings without importing AdminModule. */
@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
