'use client';

import { adminLicenseSchema, LICENSE_TYPES, type LicenseType } from '@jandi/shared';
import { TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isApiError } from '@/lib/api';
import {
  useCreateAdminLicense,
  useUpdateAdminLicense,
  type AdminLicense,
  type AdminLicenseInput,
} from '@/lib/queries/admin';
import {
  adminErrorMessage,
  changedKeys,
  fromDatetimeLocal,
  LICENSE_TYPE_LABELS,
  toDatetimeLocal,
} from './admin-utils';

interface LicenseFormValues {
  type: LicenseType;
  title: string;
  licensor: string;
  territory: string;
  provenanceUrl: string;
  attribution: string;
  validFrom: string;
  validUntil: string;
  notes: string;
}

const FIELDS: ReadonlyArray<keyof LicenseFormValues> = [
  'type',
  'title',
  'licensor',
  'territory',
  'provenanceUrl',
  'attribution',
  'validFrom',
  'validUntil',
  'notes',
];

/** Terms whose change clears an existing verification (docs/api/ADMIN.md). */
const MATERIAL: ReadonlyArray<keyof LicenseFormValues> = [
  'type',
  'licensor',
  'territory',
  'provenanceUrl',
  'validFrom',
  'validUntil',
];

function toValues(license?: AdminLicense): LicenseFormValues {
  return {
    type: license?.type ?? 'CREATIVE_COMMONS',
    title: license?.title ?? '',
    licensor: license?.licensor ?? '',
    territory: license?.territory ?? 'WORLDWIDE',
    provenanceUrl: license?.provenanceUrl ?? '',
    attribution: license?.attribution ?? '',
    validFrom: toDatetimeLocal(license?.validFrom),
    validUntil: toDatetimeLocal(license?.validUntil),
    notes: license?.notes ?? '',
  };
}

type Payload = {
  type: LicenseType;
  title: string;
  licensor: string;
  territory: string;
  provenanceUrl: string | null;
  attribution: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
};

export function LicenseFormDialog({
  open,
  onOpenChange,
  license,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  license?: AdminLicense;
  onSaved?: (license: AdminLicense) => void;
}) {
  const create = useCreateAdminLicense();
  const update = useUpdateAdminLicense();
  const form = useForm<LicenseFormValues>({ defaultValues: toValues(license) });
  const { errors, isSubmitting } = form.formState;

  React.useEffect(() => {
    if (open) form.reset(toValues(license));
  }, [open, license, form]);

  const watched = form.watch();
  const original = toValues(license);
  const materialChanged = !!license?.verified && MATERIAL.some((k) => watched[k] !== original[k]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();
    const validFrom = fromDatetimeLocal(values.validFrom);
    const validUntil = fromDatetimeLocal(values.validUntil);
    if (validFrom === undefined)
      form.setError('validFrom', { message: 'Enter a valid date and time' });
    if (validUntil === undefined)
      form.setError('validUntil', { message: 'Enter a valid date and time' });
    if (validFrom === undefined || validUntil === undefined) return;
    if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
      form.setError('validUntil', { message: 'The end must be after the start' });
      return;
    }
    const opt = (s: string) => (s.trim() ? s.trim() : null);
    const payload: Payload = {
      type: values.type,
      title: values.title.trim(),
      licensor: values.licensor.trim(),
      territory: values.territory.trim(),
      provenanceUrl: opt(values.provenanceUrl),
      attribution: opt(values.attribution),
      validFrom,
      validUntil,
      notes: opt(values.notes),
    };
    const parsed = adminLicenseSchema.safeParse(
      Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null)),
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as keyof LicenseFormValues;
        if (FIELDS.includes(field) && !form.getFieldState(field).error)
          form.setError(field, { type: 'validate', message: issue.message });
      }
      return;
    }
    try {
      let saved: AdminLicense;
      if (license) {
        const keys = changedKeys(payload, license as unknown as Record<string, unknown>).filter(
          // Compare dates by instant, not by string formatting.
          (k) =>
            !(k === 'validFrom' || k === 'validUntil') ||
            (payload[k] ? Date.parse(payload[k]!) : null) !==
              (license[k] ? Date.parse(license[k]!) : null),
        );
        if (!keys.length) {
          onOpenChange(false);
          return;
        }
        const body = Object.fromEntries(keys.map((k) => [k, payload[k]])) as AdminLicenseInput;
        saved = (await update.mutateAsync({ id: license.id, body })).license;
        toast.success(
          license.verified && !saved.verified
            ? `Saved “${saved.title}” — verification cleared, verify the new terms`
            : `Saved “${saved.title}”`,
        );
      } else {
        const body = Object.fromEntries(
          Object.entries(payload).filter(([, v]) => v !== null),
        ) as AdminLicenseInput;
        saved = (await create.mutateAsync(body)).license;
        toast.success(`Created “${saved.title}” — it starts unverified`);
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_FAILED') {
        let matched = false;
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          const field = path.split('.')[0] as keyof LicenseFormValues;
          if (FIELDS.includes(field)) {
            form.setError(field, { type: 'server', message });
            matched = true;
          }
        }
        if (matched) return;
      }
      form.setError('root.server', { type: 'server', message: adminErrorMessage(error) });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{license ? `Edit “${license.title}”` : 'New license'}</DialogTitle>
          <DialogDescription>
            Record the rights you hold for a piece of media. New licenses start unverified; an
            administrator verifies them after checking the provenance.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={onSubmit} className="grid gap-5">
          <FormError message={errors.root?.server?.message} />
          {materialChanged ? (
            <p
              role="status"
              className="flex gap-2 rounded-[10px] border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-[#fde68a]"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Changing the type, licensor, territory, provenance or validity window clears the
              verification. Assets using it stop being playable until it’s verified again.
            </p>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="license-type">Type</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="license-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LICENSE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {LICENSE_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <FormField
              label="Territory"
              htmlFor="license-territory"
              error={errors.territory?.message}
              hint="WORLDWIDE or a region, e.g. EU, US"
            >
              <Input maxLength={100} {...form.register('territory')} />
            </FormField>
          </div>
          <FormField label="Title" htmlFor="license-title" error={errors.title?.message}>
            <Input
              maxLength={200}
              autoFocus
              placeholder="Sintel — CC BY 3.0"
              {...form.register('title')}
            />
          </FormField>
          <FormField label="Licensor" htmlFor="license-licensor" error={errors.licensor?.message}>
            <Input
              maxLength={200}
              placeholder="Blender Foundation"
              {...form.register('licensor')}
            />
          </FormField>
          <FormField
            label="Provenance URL"
            htmlFor="license-provenance"
            error={errors.provenanceUrl?.message}
            hint="Where the rights can be checked."
          >
            <Input
              type="url"
              inputMode="url"
              placeholder="https://…"
              {...form.register('provenanceUrl')}
            />
          </FormField>
          <FormField
            label="Attribution"
            htmlFor="license-attribution"
            error={errors.attribution?.message}
            hint="Shown to viewers with the movie. Up to 500 characters."
          >
            <Input maxLength={500} {...form.register('attribution')} />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Valid from"
              htmlFor="license-from"
              error={errors.validFrom?.message}
              hint="Optional · your local time"
            >
              <Input type="datetime-local" {...form.register('validFrom')} />
            </FormField>
            <FormField
              label="Valid until"
              htmlFor="license-until"
              error={errors.validUntil?.message}
              hint="Optional · exclusive end"
            >
              <Input type="datetime-local" {...form.register('validUntil')} />
            </FormField>
          </div>
          <FormField
            label="Notes"
            htmlFor="license-notes"
            error={errors.notes?.message}
            hint="Internal only. Up to 2,000 characters."
          >
            <Textarea rows={3} maxLength={2000} {...form.register('notes')} />
          </FormField>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} loadingText="Saving">
              {license ? 'Save changes' : 'Create license'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
