'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createWatchlistSchema } from '@jandi/shared';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
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
import { applyApiErrors } from '@/lib/form-errors';
import { useCreateWatchlist, useUpdateWatchlist } from '@/lib/queries/library';
import type { Watchlist } from '@/lib/types';

type FormInput = z.input<typeof createWatchlistSchema>;
type FormOutput = z.output<typeof createWatchlistSchema>;

function WatchlistForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues: FormInput;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (
    values: FormOutput,
    setError: ReturnType<typeof useForm<FormInput, unknown, FormOutput>>['setError'],
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createWatchlistSchema),
    defaultValues,
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={form.handleSubmit((values) => onSubmit(values, form.setError))}
    >
      <FormError message={errors.root?.server?.message} />
      <FormField label="Name" htmlFor="watchlist-name" error={errors.name?.message}>
        <Input
          autoFocus
          maxLength={60}
          placeholder="Friday night picks"
          {...form.register('name')}
        />
      </FormField>
      <FormField
        label="Description"
        htmlFor="watchlist-description"
        error={errors.description?.message}
        hint="Optional, up to 280 characters."
      >
        <Textarea maxLength={280} rows={3} {...form.register('description')} />
      </FormField>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting} loadingText={pendingLabel}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateWatchlistDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (watchlist: Watchlist) => void | Promise<void>;
}) {
  const create = useCreateWatchlist();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New watchlist</DialogTitle>
          <DialogDescription>
            Collect titles to watch later, or to line up for a watch party.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <WatchlistForm
            defaultValues={{ name: '', description: '' }}
            submitLabel="Create watchlist"
            pendingLabel="Creating"
            onCancel={() => onOpenChange(false)}
            onSubmit={async (values, setError) => {
              try {
                const { watchlist } = await create.mutateAsync({
                  name: values.name,
                  ...(values.description ? { description: values.description } : {}),
                });
                toast.success(`Created “${watchlist.name}”`);
                await onCreated?.(watchlist);
                onOpenChange(false);
              } catch (error) {
                applyApiErrors(error, setError, ['name', 'description']);
              }
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function RenameWatchlistDialog({
  watchlist,
  open,
  onOpenChange,
}: {
  watchlist: Watchlist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateWatchlist();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit watchlist</DialogTitle>
          <DialogDescription>
            Change the name or description of “{watchlist.name}”.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <WatchlistForm
            defaultValues={{ name: watchlist.name, description: watchlist.description ?? '' }}
            submitLabel="Save changes"
            pendingLabel="Saving"
            onCancel={() => onOpenChange(false)}
            onSubmit={async (values, setError) => {
              try {
                await update.mutateAsync({
                  watchlistId: watchlist.id,
                  name: values.name,
                  description: values.description ?? '',
                });
                toast.success('Watchlist updated');
                onOpenChange(false);
              } catch (error) {
                applyApiErrors(error, setError, ['name', 'description']);
              }
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
