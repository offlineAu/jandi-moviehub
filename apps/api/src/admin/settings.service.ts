import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-context';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { publicUser } from '../users/user-view';
import type { z } from 'zod';
import {
  resolveSettingKey,
  SETTINGS,
  type SettingKey,
  type SettingValue,
} from './settings.registry';

const schemaFor = (key: SettingKey) => SETTINGS[key].schema as z.ZodType;

/** Typed access to `app_settings`, falling back to registry defaults. Exported for other modules. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Stored value if it still validates, otherwise the default. */
  private coerce<K extends SettingKey>(
    key: K,
    stored: unknown,
  ): { value: SettingValue<K>; valid: boolean } {
    const parsed = schemaFor(key).safeParse(stored);
    return parsed.success
      ? { value: parsed.data as SettingValue<K>, valid: true }
      : { value: SETTINGS[key].default as SettingValue<K>, valid: false };
  }

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row ? this.coerce(key, row.value).value : (SETTINGS[key].default as SettingValue<K>);
  }

  async list() {
    const keys = Object.keys(SETTINGS) as SettingKey[];
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: keys } },
      include: { updatedBy: { include: { profile: true } } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return {
      items: keys.map((key) => {
        const row = byKey.get(key);
        const { value, valid } = row
          ? this.coerce(key, row.value)
          : { value: SETTINGS[key].default, valid: false };
        return {
          key,
          value,
          defaultValue: SETTINGS[key].default,
          isDefault: !row || !valid,
          public: SETTINGS[key].public,
          description: SETTINGS[key].description,
          updatedAt: row?.updatedAt ?? null,
          updatedBy: row?.updatedBy ? publicUser(row.updatedBy) : null,
        };
      }),
    };
  }

  async publicSettings() {
    const [announcement, registrationEnabled] = await Promise.all([
      this.get('site.announcement'),
      this.get('registration.enabled'),
    ]);
    return {
      settings: { 'site.announcement': announcement, 'registration.enabled': registrationEnabled },
    };
  }

  async set(actor: AuthUser, rawKey: string, raw: unknown, ip?: string) {
    const resolved = resolveSettingKey(rawKey);
    if (!resolved.ok && resolved.reason === 'INVALID') {
      throw Errors.badRequest(
        'INVALID_SETTING_KEY',
        'Setting keys must match ^[a-z0-9_.-]{2,64}$ (case-insensitive)',
      );
    }
    if (!resolved.ok)
      throw Errors.badRequest('UNKNOWN_SETTING', `Unknown setting "${rawKey.slice(0, 64)}"`);
    const key = resolved.key;
    const result = schemaFor(key).safeParse(raw);
    if (!result.success) {
      throw Errors.badRequest(
        'VALIDATION_FAILED',
        `Invalid value for ${key}`,
        result.error.issues.map((i) => ({
          path: ['value', ...i.path].join('.'),
          message: i.message,
        })),
      );
    }
    const value = result.data as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.appSetting.findUnique({ where: { key } });
      await tx.appSetting.upsert({
        where: { key },
        create: { key, value, updatedById: actor.id },
        update: { value, updatedById: actor.id },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'admin.setting.update',
          targetType: 'setting',
          targetId: key,
          metadata: { key, from: (before?.value ?? null) as Prisma.InputJsonValue, to: value },
          ip,
        },
        tx,
      );
    });
    return { setting: { key, value } };
  }
}
