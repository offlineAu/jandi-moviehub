'use client';

import { adminMovieSchema } from '@jandi/shared';
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
import { Switch } from '@/components/ui/switch';
import { isApiError } from '@/lib/api';
import {
  useCreateAdminMovie,
  useUpdateAdminMovie,
  type AdminMovie,
  type AdminMovieInput,
} from '@/lib/queries/admin';
import { adminErrorMessage, changedKeys, parseGenres } from './admin-utils';

interface MovieFormValues {
  title: string;
  overview: string;
  releaseDate: string;
  runtimeMin: string;
  genres: string;
  posterUrl: string;
  backdropUrl: string;
  isDemo: boolean;
}

const FIELDS = [
  'title',
  'overview',
  'releaseDate',
  'runtimeMin',
  'genres',
  'posterUrl',
  'backdropUrl',
  'isDemo',
] as const;

function toValues(movie?: AdminMovie): MovieFormValues {
  return {
    title: movie?.title ?? '',
    overview: movie?.overview ?? '',
    releaseDate: movie?.releaseDate ?? '',
    runtimeMin: movie?.runtimeMin != null ? String(movie.runtimeMin) : '',
    genres: movie?.genres.join(', ') ?? '',
    posterUrl: movie?.posterUrl ?? '',
    backdropUrl: movie?.backdropUrl ?? '',
    isDemo: movie?.isDemo ?? false,
  };
}

/** Form strings → API body; empty optional fields become null (cleared on edit, omitted on create). */
function toPayload(
  v: MovieFormValues,
): Required<{ [K in keyof AdminMovieInput]: AdminMovieInput[K] }> {
  const opt = (s: string) => (s.trim() ? s.trim() : null);
  const runtime = v.runtimeMin.trim();
  return {
    title: v.title.trim(),
    overview: opt(v.overview),
    releaseDate: opt(v.releaseDate),
    runtimeMin: runtime ? Number(runtime) : null,
    genres: parseGenres(v.genres),
    posterUrl: opt(v.posterUrl),
    backdropUrl: opt(v.backdropUrl),
    isDemo: v.isDemo,
  };
}

function withoutNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null)) as Partial<T>;
}

export function MovieFormDialog({
  open,
  onOpenChange,
  movie,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this LOCAL movie; omit to create. */
  movie?: AdminMovie;
}) {
  const create = useCreateAdminMovie();
  const update = useUpdateAdminMovie();
  const form = useForm<MovieFormValues>({ defaultValues: toValues(movie) });
  const { errors, isSubmitting } = form.formState;

  React.useEffect(() => {
    if (open) form.reset(toValues(movie));
  }, [open, movie, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();
    const payload = toPayload(values);
    // Validate with the shared schema (the API uses the same one).
    const parsed = adminMovieSchema.safeParse(withoutNulls(payload));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as keyof MovieFormValues;
        if ((FIELDS as readonly string[]).includes(field) && !form.getFieldState(field).error) {
          form.setError(field, { type: 'validate', message: issue.message });
        }
      }
      return;
    }
    try {
      if (movie) {
        const keys = changedKeys(payload, {
          ...movie,
          genres: movie.genres,
        } as unknown as Record<string, unknown>);
        if (!keys.length) {
          onOpenChange(false);
          return;
        }
        const body = Object.fromEntries(
          keys.map((k) => [k, payload[k]]),
        ) as Partial<AdminMovieInput>;
        const { movie: saved } = await update.mutateAsync({ id: movie.id, body });
        toast.success(`Saved “${saved.title}”`);
      } else {
        const { movie: saved } = await create.mutateAsync(withoutNulls(payload) as AdminMovieInput);
        toast.success(`Created “${saved.title}”`);
      }
      onOpenChange(false);
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_FAILED') {
        const fieldErrors = error.fieldErrors;
        let matched = false;
        for (const [path, message] of Object.entries(fieldErrors)) {
          const field = path.split('.')[0] as keyof MovieFormValues;
          if ((FIELDS as readonly string[]).includes(field)) {
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
          <DialogTitle>{movie ? `Edit “${movie.title}”` : 'New movie'}</DialogTitle>
          <DialogDescription>
            {movie
              ? 'Changes apply to the public catalog straight away.'
              : 'Adds a local title to the catalog. It becomes playable once an approved media asset with a verified license is attached.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={onSubmit} className="grid gap-5">
          <FormError message={errors.root?.server?.message} />
          <FormField label="Title" htmlFor="movie-title" error={errors.title?.message}>
            <Input maxLength={200} autoFocus {...form.register('title')} />
          </FormField>
          <FormField
            label="Overview"
            htmlFor="movie-overview"
            error={errors.overview?.message}
            hint="Optional, up to 4,000 characters."
          >
            <Textarea rows={4} maxLength={4000} {...form.register('overview')} />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Release date"
              htmlFor="movie-release"
              error={errors.releaseDate?.message}
            >
              <Input type="date" {...form.register('releaseDate')} />
            </FormField>
            <FormField
              label="Runtime (minutes)"
              htmlFor="movie-runtime"
              error={errors.runtimeMin?.message}
              hint="1–1000"
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                {...form.register('runtimeMin')}
              />
            </FormField>
          </div>
          <FormField
            label="Genres"
            htmlFor="movie-genres"
            error={errors.genres?.message}
            hint="Comma-separated, up to 10. Existing genres are matched by name; new ones are created."
          >
            <Input placeholder="Drama, Science Fiction" {...form.register('genres')} />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Poster URL" htmlFor="movie-poster" error={errors.posterUrl?.message}>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://…"
                {...form.register('posterUrl')}
              />
            </FormField>
            <FormField
              label="Backdrop URL"
              htmlFor="movie-backdrop"
              error={errors.backdropUrl?.message}
            >
              <Input
                type="url"
                inputMode="url"
                placeholder="https://…"
                {...form.register('backdropUrl')}
              />
            </FormField>
          </div>
          <div className="flex items-start justify-between gap-6 rounded-xl border border-border bg-secondary/50 p-4">
            <div>
              <label htmlFor="movie-demo" className="text-sm font-medium">
                Demonstration content
              </label>
              <p id="movie-demo-desc" className="mt-0.5 text-sm text-muted">
                Demo titles are labelled as such everywhere in the app.
              </p>
            </div>
            <Controller
              control={form.control}
              name="isDemo"
              render={({ field }) => (
                <Switch
                  id="movie-demo"
                  aria-describedby="movie-demo-desc"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} loadingText="Saving">
              {movie ? 'Save changes' : 'Create movie'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
