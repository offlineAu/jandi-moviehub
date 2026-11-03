'use client';

import { Globe, Lock, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api';
import { useAdminSettings, useSaveSetting, type AdminSetting } from '@/lib/queries/admin';
import { formatRelative } from '@/lib/utils';
import { adminErrorMessage } from './admin-utils';
import { AdminPageHeader, AdminQueryError } from './admin-ui';

type Spec =
  | { kind: 'text'; title: string; max: number; placeholder: string }
  | { kind: 'int'; title: string; min: number; max: number; unit: string }
  | { kind: 'bool'; title: string; on: string; off: string };

/** Typed controls for the settings the API knows (apps/api/src/admin/settings.registry.ts). */
const SPECS: Record<string, Spec> = {
  'site.announcement': {
    kind: 'text',
    title: 'Site announcement',
    max: 280,
    placeholder: 'e.g. Scheduled maintenance on Sunday 02:00–03:00 UTC',
  },
  'rooms.maxMembersDefault': {
    kind: 'int',
    title: 'Default room size',
    min: 2,
    max: 100,
    unit: 'members',
  },
  'chat.slowModeSec': { kind: 'int', title: 'Chat slow mode', min: 0, max: 60, unit: 'seconds' },
  'registration.enabled': {
    kind: 'bool',
    title: 'Open registration',
    on: 'New accounts can sign up',
    off: 'Sign-ups are closed',
  },
};

function display(spec: Spec | undefined, value: unknown): string {
  if (spec?.kind === 'bool') return value ? 'On' : 'Off';
  if (spec?.kind === 'text') return value ? `“${String(value)}”` : 'Empty (no banner)';
  if (spec?.kind === 'int') return `${String(value)} ${spec.unit}`;
  return JSON.stringify(value);
}

/** Client-side check mirroring the API's per-key validation. Returns an error message or null. */
function validate(spec: Spec, draft: string | boolean): string | null {
  if (spec.kind === 'text')
    return String(draft).length > spec.max ? `Use at most ${spec.max} characters` : null;
  if (spec.kind === 'int') {
    const text = String(draft).trim();
    const n = Number(text);
    if (!text || !Number.isInteger(n)) return 'Enter a whole number';
    if (n < spec.min || n > spec.max) return `Enter a value from ${spec.min} to ${spec.max}`;
  }
  return null;
}

function toDraft(spec: Spec, value: unknown): string | boolean {
  if (spec.kind === 'bool') return value === true;
  return value == null ? '' : String(value);
}

function toValue(spec: Spec, draft: string | boolean): unknown {
  if (spec.kind === 'bool') return draft === true;
  if (spec.kind === 'int') return Number(String(draft).trim());
  return String(draft).trim();
}

function SettingCard({ setting }: { setting: AdminSetting }) {
  const spec = SPECS[setting.key];
  const save = useSaveSetting();
  const [draft, setDraft] = React.useState<string | boolean>(() =>
    spec ? toDraft(spec, setting.value) : '',
  );
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (spec) setDraft(toDraft(spec, setting.value));
  }, [setting.value, spec]);

  const id = `setting-${setting.key.replace(/[^a-z0-9]+/gi, '-')}`;
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const errorId = `${id}-error`;

  if (!spec) {
    return (
      <section
        aria-labelledby={titleId}
        className="rounded-2xl border border-border bg-surface/60 p-5"
      >
        <h2 id={titleId} className="font-mono text-sm">
          {setting.key}
        </h2>
        <p className="mt-1 text-sm text-muted">{setting.description}</p>
        <pre className="mt-3 overflow-auto rounded-lg bg-background/70 p-3 font-mono text-xs">
          {JSON.stringify(setting.value, null, 2)}
        </pre>
      </section>
    );
  }

  const current = toDraft(spec, setting.value);
  const dirty = draft !== current;
  const localError = validate(spec, draft);
  const isDefaultDraft =
    JSON.stringify(toValue(spec, draft)) === JSON.stringify(setting.defaultValue);

  const submit = (value: unknown, message: string) => {
    setError(null);
    save.mutate(
      { key: setting.key, value },
      {
        onSuccess: () => toast.success(message),
        onError: (e) => {
          if (isApiError(e) && e.code === 'VALIDATION_FAILED') {
            const first = Object.values(e.fieldErrors)[0];
            setError(first ?? adminErrorMessage(e));
          } else setError(adminErrorMessage(e));
        },
      },
    );
  };

  const shownError = error ?? (dirty ? localError : null);

  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-4 rounded-2xl border border-border bg-surface/60 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {spec.title}
          </h2>
          <p id={descId} className="mt-0.5 text-sm text-muted">
            {setting.description}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {setting.public ? (
            <Badge variant="outline">
              <Globe aria-hidden="true" />
              Public
            </Badge>
          ) : (
            <Badge variant="outline">
              <Lock aria-hidden="true" />
              Internal
            </Badge>
          )}
          {setting.isDefault ? (
            <Badge variant="neutral">Default</Badge>
          ) : (
            <Badge variant="primary">Customised</Badge>
          )}
        </span>
      </div>

      <form
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty || localError) return;
          submit(toValue(spec, draft), `Saved ${spec.title.toLowerCase()}`);
        }}
      >
        {spec.kind === 'text' ? (
          <div className="grid gap-1.5">
            <label htmlFor={id} className="sr-only">
              {spec.title}
            </label>
            <Textarea
              id={id}
              rows={3}
              value={String(draft)}
              placeholder={spec.placeholder}
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby={`${descId} ${id}-count${shownError ? ` ${errorId}` : ''}`}
              aria-invalid={!!shownError || undefined}
            />
            <p
              id={`${id}-count`}
              className={`text-right text-xs tabular-nums ${String(draft).length > spec.max ? 'text-danger' : 'text-subtle'}`}
            >
              {String(draft).length}/{spec.max}
            </p>
          </div>
        ) : spec.kind === 'int' ? (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={id} className="sr-only">
              {spec.title} ({spec.unit})
            </label>
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={spec.min}
              max={spec.max}
              step={1}
              value={String(draft)}
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby={`${descId} ${id}-range${shownError ? ` ${errorId}` : ''}`}
              aria-invalid={!!shownError || undefined}
              className="w-32 tabular-nums"
            />
            <span id={`${id}-range`} className="text-sm text-muted">
              {spec.unit} · {spec.min}–{spec.max}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Switch
              id={id}
              checked={draft === true}
              onCheckedChange={(checked) => setDraft(checked)}
              aria-describedby={descId}
            />
            <label htmlFor={id} className="text-sm">
              {draft ? spec.on : spec.off}
            </label>
          </div>
        )}

        {shownError ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {shownError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">
            Default: {display(spec, setting.defaultValue)}
            {setting.updatedAt
              ? ` · changed ${formatRelative(setting.updatedAt)}${setting.updatedBy ? ` by @${setting.updatedBy.username}` : ''}`
              : ''}
          </p>
          <span className="flex flex-wrap gap-2">
            {dirty ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(current)}
                disabled={save.isPending}
              >
                Undo
              </Button>
            ) : null}
            {!setting.isDefault && !dirty ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => submit(setting.defaultValue, `${spec.title} reset to default`)}
                disabled={save.isPending}
              >
                <RotateCcw aria-hidden="true" />
                Reset to default
              </Button>
            ) : null}
            <Button
              type="submit"
              size="sm"
              disabled={!dirty || !!localError}
              loading={save.isPending}
              loadingText="Saving"
            >
              <Save aria-hidden="true" />
              Save{dirty && isDefaultDraft ? ' (default)' : ''}
            </Button>
          </span>
        </div>
      </form>
    </section>
  );
}

export function AdminSettingsView() {
  const query = useAdminSettings();
  return (
    <div>
      <AdminPageHeader
        title="Settings"
        description="Runtime switches for the whole site. Each setting saves on its own."
      />
      <div className="mt-6 grid max-w-3xl grid-cols-1 gap-4">
        {query.isLoading ? (
          <div role="status" aria-label="Loading settings" className="grid gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : query.isError ? (
          <AdminQueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Settings didn’t load"
          />
        ) : !query.data?.items.length ? (
          <EmptyState icon={SlidersHorizontal} title="No settings are defined" />
        ) : (
          query.data.items.map((s) => <SettingCard key={s.key} setting={s} />)
        )}
      </div>
    </div>
  );
}
