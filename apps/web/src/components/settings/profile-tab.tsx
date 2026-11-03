'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { cleanText } from '@jandi/shared';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { useRemoveAvatar, useUpdateProfile, useUploadAvatar } from '@/lib/queries/profile';
import type { Me } from '@/lib/types';
import { SettingsSection } from './section';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const profileSchema = z.object({
  displayName: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, 'Enter a display name').max(40, 'Use 40 characters or fewer')),
  bio: z.string().transform(cleanText).pipe(z.string().max(280, 'Keep your bio to 280 characters')),
});
type ProfileIn = z.input<typeof profileSchema>;
type ProfileOut = z.output<typeof profileSchema>;

function AvatarEditor({ me }: { me: Me }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!AVATAR_TYPES.includes(f.type)) {
      setError('Choose a PNG, JPEG, WebP or GIF image.');
      return;
    }
    if (f.size > MAX_AVATAR_BYTES) {
      setError('Images must be 2 MB or smaller.');
      return;
    }
    setFile(f);
  };

  const reset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <Avatar
        src={preview ?? me.avatarUrl}
        name={me.displayName}
        size="xl"
        className="ring-2 ring-white/10"
      />
      <div className="grid gap-3">
        <input
          ref={inputRef}
          id="avatar-file"
          type="file"
          accept={AVATAR_TYPES.join(',')}
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
          aria-describedby="avatar-help"
        />
        <div className="flex flex-wrap gap-2">
          {file ? (
            <>
              <Button
                loading={upload.isPending}
                loadingText="Uploading"
                onClick={() =>
                  upload.mutate(file, {
                    onSuccess: () => {
                      toast.success('Profile photo updated');
                      reset();
                    },
                    onError: (e) => setError(errorMessage(e, 'Upload failed. Try another image.')),
                  })
                }
              >
                Save photo
              </Button>
              <Button variant="ghost" onClick={reset} disabled={upload.isPending}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => inputRef.current?.click()}>
                <Camera aria-hidden="true" />
                {me.avatarUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              {me.avatarUrl ? (
                <Button
                  variant="ghost"
                  loading={remove.isPending}
                  loadingText="Removing"
                  onClick={() =>
                    remove.mutate(undefined, {
                      onSuccess: () => toast.success('Profile photo removed'),
                      onError: (e) =>
                        toast.error(errorMessage(e, 'Couldn’t remove the photo. Try again.')),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Remove
                </Button>
              ) : null}
            </>
          )}
        </div>
        <p id="avatar-help" className="text-xs text-muted">
          {file
            ? `Previewing ${file.name}. Save to apply it.`
            : 'PNG, JPEG, WebP or GIF, up to 2 MB.'}
        </p>
        {error ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileTab({ me }: { me: Me }) {
  const update = useUpdateProfile();
  const form = useForm<ProfileIn, unknown, ProfileOut>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: me.displayName, bio: me.bio ?? '' },
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const bioLength = form.watch('bio')?.length ?? 0;

  return (
    <div className="grid gap-6">
      <SettingsSection title="Profile photo">
        <AvatarEditor me={me} />
      </SettingsSection>
      <SettingsSection
        title="About you"
        description={`Shown on your public profile at /profile/${me.username}.`}
      >
        <form
          noValidate
          className="grid gap-5"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const { user } = await update.mutateAsync({
                displayName: values.displayName,
                bio: values.bio,
              });
              form.reset({ displayName: user.displayName, bio: user.bio ?? '' });
              toast.success('Profile saved');
            } catch (error) {
              applyApiErrors(error, form.setError, ['displayName', 'bio']);
            }
          })}
        >
          <FormError message={errors.root?.server?.message} />
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Display name"
              htmlFor="profile-display-name"
              error={errors.displayName?.message}
            >
              <Input maxLength={40} autoComplete="nickname" {...form.register('displayName')} />
            </FormField>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Username</span>
              <p className="flex h-11 items-center rounded-[10px] border border-border bg-background/40 px-3.5 text-sm text-muted">
                @{me.username}
              </p>
            </div>
          </div>
          <FormField
            label="Bio"
            htmlFor="profile-bio"
            error={errors.bio?.message}
            hint={`${bioLength}/280`}
          >
            <Textarea
              rows={4}
              maxLength={280}
              placeholder="Favorite genres, the movie you quote too often…"
              {...form.register('bio')}
            />
          </FormField>
          <div className="flex items-center justify-between gap-3">
            <Link
              href={`/profile/${me.username}`}
              className="rounded text-sm font-medium link-fx focus-ring"
            >
              View public profile
            </Link>
            <Button type="submit" loading={isSubmitting} loadingText="Saving" disabled={!isDirty}>
              Save profile
            </Button>
          </div>
        </form>
      </SettingsSection>
    </div>
  );
}
