'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createPlaylistSchema, PLAYLIST_VISIBILITIES } from '@jandi/shared';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { applyApiErrors } from '@/lib/form-errors';
import { useCreatePlaylist, useUpdatePlaylist, type Playlist } from '@/lib/queries/playlists';
import { VISIBILITY_COPY } from './playlist-utils';

type FormInput = z.input<typeof createPlaylistSchema>;
type FormOutput = z.output<typeof createPlaylistSchema>;
type SetError = ReturnType<typeof useForm<FormInput, unknown, FormOutput>>['setError'];

const FIELDS = ['name', 'description', 'visibility', 'collaborative'] as const;

function PlaylistForm({
  idPrefix,
  defaultValues,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  defaultValues: FormInput;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (values: FormOutput, setError: SetError) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createPlaylistSchema),
    defaultValues,
  });
  const { errors, isSubmitting } = form.formState;
  const visibility = form.watch('visibility') ?? 'PRIVATE';
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={form.handleSubmit((values) => onSubmit(values, form.setError))}
    >
      <FormError message={errors.root?.server?.message} />
      <FormField label="Name" htmlFor={`${idPrefix}-name`} error={errors.name?.message}>
        <Input autoFocus maxLength={80} placeholder="Sci-fi Saturday" {...form.register('name')} />
      </FormField>
      <FormField
        label="Description"
        htmlFor={`${idPrefix}-description`}
        error={errors.description?.message}
        hint="Optional, up to 500 characters."
      >
        <Textarea maxLength={500} rows={3} {...form.register('description')} />
      </FormField>
      <FormField
        label="Visibility"
        htmlFor={`${idPrefix}-visibility`}
        error={errors.visibility?.message}
        hint={VISIBILITY_COPY[visibility].description}
      >
        <Controller
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <Select value={field.value ?? 'PRIVATE'} onValueChange={field.onChange}>
              <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYLIST_VISIBILITIES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {VISIBILITY_COPY[v].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <Controller
        control={form.control}
        name="collaborative"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4 rounded-[10px] border border-border-strong bg-secondary/60 px-3.5 py-3">
            <div className="grid gap-0.5">
              <label htmlFor={`${idPrefix}-collaborative`} className="text-sm font-medium">
                Collaborative
              </label>
              <p id={`${idPrefix}-collaborative-desc`} className="text-xs text-muted">
                Collaborators you add can add, remove and reorder movies.
              </p>
            </div>
            <Switch
              id={`${idPrefix}-collaborative`}
              aria-describedby={`${idPrefix}-collaborative-desc`}
              checked={!!field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          </div>
        )}
      />
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

export function CreatePlaylistDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (playlist: Playlist) => void | Promise<void>;
}) {
  const create = useCreatePlaylist();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New playlist</DialogTitle>
          <DialogDescription>
            Line up movies in order — then watch them back to back as a marathon with friends.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PlaylistForm
            idPrefix="playlist-create"
            defaultValues={{
              name: '',
              description: '',
              visibility: 'PRIVATE',
              collaborative: false,
            }}
            submitLabel="Create playlist"
            pendingLabel="Creating"
            onCancel={() => onOpenChange(false)}
            onSubmit={async (values, setError) => {
              try {
                const playlist = await create.mutateAsync({
                  name: values.name,
                  visibility: values.visibility,
                  collaborative: values.collaborative,
                  ...(values.description ? { description: values.description } : {}),
                });
                toast.success(`Created “${playlist.name}”`);
                await onCreated?.(playlist);
                onOpenChange(false);
              } catch (error) {
                applyApiErrors(error, setError, FIELDS);
              }
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function EditPlaylistDialog({
  playlist,
  open,
  onOpenChange,
}: {
  playlist: Playlist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdatePlaylist(playlist.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit playlist</DialogTitle>
          <DialogDescription>
            Change the details and who can see “{playlist.name}”.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PlaylistForm
            idPrefix="playlist-edit"
            defaultValues={{
              name: playlist.name,
              description: playlist.description ?? '',
              visibility: playlist.visibility,
              collaborative: playlist.collaborative,
            }}
            submitLabel="Save changes"
            pendingLabel="Saving"
            onCancel={() => onOpenChange(false)}
            onSubmit={async (values, setError) => {
              try {
                await update.mutateAsync({
                  name: values.name,
                  description: values.description ?? '',
                  visibility: values.visibility,
                  collaborative: values.collaborative,
                });
                toast.success('Playlist updated');
                onOpenChange(false);
              } catch (error) {
                applyApiErrors(error, setError, FIELDS);
              }
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
