import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { userSearchSchema } from '@jandi/shared';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { type AuthUser, CurrentUser, Public, RateLimit } from '../common/auth-context';
import { Errors } from '../common/errors';
import { ValidBody, ValidQuery } from '../common/zod';
import { contentTypeFor } from '../catalog/media-types';
import { StorageService } from '../storage/storage.service';
import { AVATAR_FILE, AVATAR_MAX_BYTES } from './avatar';
import { type ProfilePatchInput, profilePatchSchema } from './profile.schemas';
import { UsersService } from './users.service';

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  @RateLimit({ name: 'profiles:update', limit: 30, windowSec: 60, by: 'user' })
  @Patch('me')
  async update(
    @CurrentUser() user: AuthUser,
    @ValidBody(profilePatchSchema) body: ProfilePatchInput,
  ) {
    await this.users.updateProfile(user.id, body);
    return { user: await this.auth.me(user) };
  }

  @RateLimit({ name: 'profiles:avatar', limit: 10, windowSec: 600, by: 'user' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 } }),
  )
  @Post('me/avatar')
  @HttpCode(200)
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    return this.users.setAvatar(user.id, file);
  }

  @HttpCode(204)
  @Delete('me/avatar')
  async removeAvatar(@CurrentUser() user: AuthUser) {
    await this.users.removeAvatar(user.id);
  }

  @Public()
  @Get('avatars/:file')
  async avatar(@Param('file') file: string, @Res() res: Response) {
    if (!AVATAR_FILE.test(file)) throw Errors.notFound('Avatar');
    const key = `avatars/${file}`;
    if (!(await this.users.avatarKeyInUse(key))) throw Errors.notFound('Avatar');
    const stat = await this.storage.stat(key);
    if (!stat) throw Errors.notFound('Avatar');
    const contentType = contentTypeFor(file);
    if (this.storage.defaultDriver === 'S3') {
      const url = await this.storage.signedUrl(key, { expiresInSec: 3600, contentType });
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.redirect(302, url!);
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(stat.size));
    // Keys are random per upload, so the bytes behind a URL never change.
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    await pipeline(await this.storage.createReadStream(key), res).catch(() => {
      if (!res.destroyed) res.destroy();
    });
  }

  @Public()
  @Get(':username')
  profile(@Param('username') username: string, @CurrentUser() viewer?: AuthUser) {
    if (!/^[A-Za-z0-9_]{1,24}$/.test(username)) throw Errors.notFound('Profile');
    return this.users.profile(username, viewer?.id);
  }
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RateLimit({ name: 'users:search', limit: 60, windowSec: 60, by: 'user' })
  @Get('search')
  async search(
    @CurrentUser() user: AuthUser,
    @ValidQuery(userSearchSchema) query: z.infer<typeof userSearchSchema>,
  ) {
    return { items: await this.users.search(query.q, user.id) };
  }
}
