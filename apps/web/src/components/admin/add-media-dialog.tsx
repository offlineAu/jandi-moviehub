'use client';

import { adminMediaAssetSchema, MEDIA_FORMATS, type MediaFormat } from '@jandi/shared';
import { CheckCircle2, Copy, FileVideo, Upload, X } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
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
  uploadMediaFile,
  useAdminLicenses,
  useAdminMovies,
  useRegisterMedia,
  type AdminLicense,
  type AdminMediaAsset,
  type AdminMovie,
  type MediaUpload,
} from '@/lib/queries/admin';
import {
  adminErrorMessage,
  checkVideoFile,
  DEFAULT_MIME,
  formatBytes,
  formatDuration,
  LICENSE_TYPE_LABELS,
} from './admin-utils';
import { EntityPicker, useDebounced } from './entity-picker';
import { LicenseStatusBadges } from './licenses-view';

interface RegisterValues {
  format: MediaFormat;
  storageKey: string;
  mimeType: string;
  durationSec: string;
  label: string;
}

type MovieChoice = Pick<AdminMovie, 'id' | 'title'> & Partial<AdminMovie>;

const FIELDS = [
  'movieId',
  'licenseId',
  'format',
  'storageKey',
  'mimeType',
  'durationSec',
  'label',
] as const;
type FieldName = (typeof FIELDS)[number];

/** Reads the duration of a local video file (no upload needed). Null if the browser can't tell. */
function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(value);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    window.setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'invalid'; message: string }
  | { phase: 'uploading'; file: File; loaded: number; total: number }
  | { phase: 'done'; file: File; upload: MediaUpload }
  | { phase: 'error'; file: File; message: string };

function UploadPanel({ onUploaded }: { onUploaded: (upload: MediaUpload, file: File) => void }) {
  const [state, setState] = React.useState<UploadState>({ phase: 'idle' });
  const [file, setFile] = React.useState<File | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const start = (selected: File) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ phase: 'uploading', file: selected, loaded: 0, total: selected.size });
    uploadMediaFile(selected, {
      signal: controller.signal,
      onProgress: (loaded, total) =>
        setState({ phase: 'uploading', file: selected, loaded, total }),
    })
      .then((upload) => {
        setState({ phase: 'done', file: selected, upload });
        toast.success('Video uploaded');
        onUploaded(upload, selected);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState({ phase: 'idle' });
          return;
        }
        setState({ phase: 'error', file: selected, message: adminErrorMessage(error) });
      });
  };

  const pct =
    state.phase === 'uploading' && state.total ? Math.round((state.loaded / state.total) * 100) : 0;

  return (
    <section
      aria-labelledby="upload-title"
      className="grid gap-3 rounded-xl border border-border bg-secondary/40 p-4"
    >
      <div>
        <h3 id="upload-title" className="text-sm font-semibold">
          1 · Upload a video <span className="font-normal text-muted">(optional)</span>
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          WebM or MP4, up to 500 MB. The server checks the file’s contents, not its name. Skip this
          if the file is already in storage.
        </p>
      </div>
      {state.phase === 'done' ? (
        <div
          role="status"
          className="grid gap-2 rounded-lg border border-success/30 bg-success/[0.06] p-3"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            Uploaded {state.file.name}
          </p>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Storage key</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <code className="truncate font-mono text-foreground">{state.upload.storageKey}</code>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label="Copy storage key"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(state.upload.storageKey)
                    .then(() => toast.success('Storage key copied'))
                    .catch(() => toast.error('Couldn’t copy — select the key instead'));
                }}
              >
                <Copy aria-hidden="true" />
              </Button>
            </dd>
            <dt className="text-muted">Detected</dt>
            <dd>
              {state.upload.format} · {state.upload.mimeType} ·{' '}
              {formatBytes(state.upload.sizeBytes)} · {state.upload.storageDriver.toLowerCase()}{' '}
              storage
            </dd>
          </dl>
          <p className="text-xs text-muted">
            The registration form below is filled in from this upload.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="media-file" className="sr-only">
              Video file
            </Label>
            <input
              ref={inputRef}
              id="media-file"
              type="file"
              accept="video/webm,video/mp4,.webm,.mp4"
              disabled={state.phase === 'uploading'}
              aria-describedby="media-file-status"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                if (!selected) return setState({ phase: 'idle' });
                const problem = checkVideoFile(selected);
                setState(problem ? { phase: 'invalid', message: problem } : { phase: 'idle' });
              }}
              className="block w-full min-w-0 text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface-raised file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-[#2a2a3e] sm:w-auto sm:flex-1"
            />
            {state.phase === 'uploading' ? (
              <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                <X aria-hidden="true" />
                Cancel upload
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={!file || state.phase === 'invalid'}
                onClick={() => file && start(file)}
              >
                <Upload aria-hidden="true" />
                Upload
              </Button>
            )}
          </div>
          <div id="media-file-status" aria-live="polite">
            {file && state.phase !== 'invalid' && state.phase !== 'error' ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <FileVideo className="size-3.5" aria-hidden="true" />
                {file.name} · {formatBytes(file.size)}
              </p>
            ) : null}
            {state.phase === 'invalid' || state.phase === 'error' ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {state.message}
              </p>
            ) : null}
          </div>
          {state.phase === 'uploading' ? (
            <div className="grid gap-1">
              <div
                role="progressbar"
                aria-label={`Uploading ${state.file.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-2 overflow-hidden rounded-full bg-primary/15"
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs tabular-nums text-muted">
                {pct}% · {formatBytes(state.loaded)} of {formatBytes(state.total)}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function AddMediaDialog({
  open,
  onOpenChange,
  initialMovie,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMovie?: { id: string; title: string } | null;
  onRegistered?: (asset: AdminMediaAsset) => void;
}) {
  const register = useRegisterMedia();
  const form = useForm<RegisterValues>({
    defaultValues: {
      format: 'WEBM',
      storageKey: '',
      mimeType: '',
      durationSec: '',
      label: 'Main feature',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [movie, setMovie] = React.useState<MovieChoice | null>(initialMovie ?? null);
  const [license, setLicense] = React.useState<AdminLicense | null>(null);
  const [movieSearch, setMovieSearch] = React.useState('');
  const [licenseSearch, setLicenseSearch] = React.useState('');
  const [pickerErrors, setPickerErrors] = React.useState<
    Partial<Record<'movieId' | 'licenseId', string>>
  >({});
  const movieQ = useDebounced(movieSearch.trim());
  const licenseQ = useDebounced(licenseSearch.trim());
  const movies = useAdminMovies({ q: movieQ || undefined, page: 1, pageSize: 8 }, open && !movie);
  const licenses = useAdminLicenses(
    { q: licenseQ || undefined, page: 1, pageSize: 8 },
    open && !license,
  );
  const format = form.watch('format');
  const duration = Number(form.watch('durationSec'));

  const onUploaded = (upload: MediaUpload, file: File) => {
    form.setValue('format', upload.format);
    form.setValue('storageKey', upload.storageKey);
    form.setValue('mimeType', upload.mimeType);
    form.clearErrors(['storageKey', 'format', 'mimeType']);
    if (!form.getValues('label') || form.getValues('label') === 'Main feature')
      form.setValue('label', `${upload.format === 'WEBM' ? 'WebM' : 'MP4'} upload`);
    void probeDuration(file).then((sec) => {
      if (sec) {
        form.setValue('durationSec', String(Math.round(sec * 10) / 10));
        form.clearErrors('durationSec');
      }
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();
    const nextPickerErrors: typeof pickerErrors = {};
    const body = {
      movieId: movie?.id ?? '',
      licenseId: license?.id ?? '',
      format: values.format,
      storageKey: values.storageKey.trim(),
      mimeType: values.mimeType.trim(),
      durationSec: values.durationSec.trim() ? Number(values.durationSec) : Number.NaN,
      label: values.label.trim() || 'Main feature',
    };
    if (!movie) nextPickerErrors.movieId = 'Choose the movie this file belongs to';
    if (!license) nextPickerErrors.licenseId = 'Choose the license that covers this file';
    const parsed = adminMediaAssetSchema.safeParse(body);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as FieldName;
        if (field === 'movieId' || field === 'licenseId') continue;
        if ((FIELDS as readonly string[]).includes(field) && !form.getFieldState(field).error) {
          form.setError(field, {
            message:
              field === 'durationSec'
                ? 'Enter the duration in seconds (1 s – 12 h)'
                : issue.message,
          });
        }
      }
    }
    setPickerErrors(nextPickerErrors);
    if (!parsed.success || Object.keys(nextPickerErrors).length) return;
    try {
      const { asset } = await register.mutateAsync(parsed.data);
      toast.success(`Registered “${asset.label}” for ${asset.movie.title} — pending review`);
      onRegistered?.(asset);
      onOpenChange(false);
    } catch (error) {
      if (isApiError(error)) {
        if (error.code === 'MEDIA_FILE_MISSING' || error.code === 'INVALID_STORAGE_KEY') {
          form.setError('storageKey', { message: adminErrorMessage(error) });
          return;
        }
        if (error.code === 'VALIDATION_FAILED') {
          let matched = false;
          for (const [path, message] of Object.entries(error.fieldErrors)) {
            const field = path.split('.')[0] as FieldName;
            if (field === 'movieId' || field === 'licenseId') {
              setPickerErrors((p) => ({ ...p, [field]: message }));
              matched = true;
            } else if ((FIELDS as readonly string[]).includes(field)) {
              form.setError(field, { message });
              matched = true;
            }
          }
          if (matched) return;
        }
      }
      form.setError('root.server', { message: adminErrorMessage(error) });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a media asset</DialogTitle>
          <DialogDescription>
            Upload a file (or point at one already in storage) and register it against a movie and
            the license that covers it. New assets start pending review.
          </DialogDescription>
        </DialogHeader>
        <UploadPanel onUploaded={onUploaded} />
        <form
          noValidate
          onSubmit={onSubmit}
          className="grid gap-5"
          aria-labelledby="register-title"
        >
          <h3 id="register-title" className="text-sm font-semibold">
            2 · Register the asset
          </h3>
          <FormError message={errors.root?.server?.message} />
          <div className="grid gap-1.5">
            <EntityPicker<MovieChoice>
              id="media-movie"
              label="Movie"
              items={movies.data?.items}
              loading={movies.isLoading}
              error={movies.error}
              search={movieSearch}
              onSearchChange={setMovieSearch}
              selected={movie}
              onSelect={(m) => {
                setMovie(m);
                setPickerErrors((p) => ({ ...p, movieId: undefined }));
              }}
              getKey={(m) => m.id}
              emptyText={movieQ ? `No movies match “${movieQ}”` : 'No movies in the catalog'}
              invalid={!!pickerErrors.movieId}
              describedBy={pickerErrors.movieId ? 'media-movie-error' : undefined}
              renderItem={(m) => (
                <>
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {m.releaseDate ? `${m.releaseDate.slice(0, 4)} · ` : ''}
                    {m.assetCount ?? 0} asset{m.assetCount === 1 ? '' : 's'}
                  </span>
                </>
              )}
              renderSelected={(m) => (
                <span className="block truncate text-sm font-medium">{m.title}</span>
              )}
            />
            {pickerErrors.movieId ? (
              <p id="media-movie-error" role="alert" className="text-xs font-medium text-danger">
                {pickerErrors.movieId}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <EntityPicker
              id="media-license"
              label="License"
              items={licenses.data?.items}
              loading={licenses.isLoading}
              error={licenses.error}
              search={licenseSearch}
              onSearchChange={setLicenseSearch}
              selected={license}
              onSelect={(l) => {
                setLicense(l);
                setPickerErrors((p) => ({ ...p, licenseId: undefined }));
              }}
              getKey={(l) => l.id}
              emptyText={
                licenseQ ? `No licenses match “${licenseQ}”` : 'No licenses yet — create one first'
              }
              invalid={!!pickerErrors.licenseId}
              describedBy={pickerErrors.licenseId ? 'media-license-error' : undefined}
              renderItem={(l) => (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {LICENSE_TYPE_LABELS[l.type] ?? l.type} · {l.licensor}
                    </span>
                  </span>
                  <LicenseStatusBadges license={l} />
                </>
              )}
              renderSelected={(l) => (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{l.title}</span>
                  <LicenseStatusBadges license={l} />
                </span>
              )}
            />
            {pickerErrors.licenseId ? (
              <p id="media-license-error" role="alert" className="text-xs font-medium text-danger">
                {pickerErrors.licenseId}
              </p>
            ) : license && !license.usable ? (
              <p className="text-xs text-warning">
                You can register against this license, but the asset can’t be approved until the
                license is verified and inside its validity window.
              </p>
            ) : null}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="media-format">Format</Label>
              <Controller
                control={form.control}
                name="format"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="media-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDIA_FORMATS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f === 'HLS' ? 'HLS (directory with index.m3u8)' : f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <FormField
              label="MIME type"
              htmlFor="media-mime"
              error={errors.mimeType?.message}
              hint={`Leave empty for ${DEFAULT_MIME[format]}`}
            >
              <Input
                maxLength={100}
                placeholder={DEFAULT_MIME[format]}
                {...form.register('mimeType')}
              />
            </FormField>
          </div>
          <FormField
            label="Storage key"
            htmlFor="media-key"
            error={errors.storageKey?.message}
            hint={
              format === 'HLS'
                ? 'A directory that contains index.m3u8, e.g. hls/my-movie'
                : 'Relative path in media storage, e.g. uploads/<id>.webm'
            }
          >
            <Input
              maxLength={500}
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
              {...form.register('storageKey')}
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Duration (seconds)"
              htmlFor="media-duration"
              error={errors.durationSec?.message}
              hint={
                duration > 0
                  ? `≈ ${formatDuration(duration)}`
                  : 'Filled in automatically after an upload'
              }
            >
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                {...form.register('durationSec')}
              />
            </FormField>
            <FormField
              label="Label"
              htmlFor="media-label"
              error={errors.label?.message}
              hint="Shown to viewers, e.g. “Main feature”"
            >
              <Input maxLength={80} {...form.register('label')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} loadingText="Registering">
              Register asset
            </Button>
          </DialogFooter>
        </form>
        {movie && license ? (
          <p className="sr-only" aria-live="polite">
            {`Movie ${movie.title} and license ${license.title} selected.`}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
