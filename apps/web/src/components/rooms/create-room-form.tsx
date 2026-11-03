'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createRoomSchema } from '@jandi/shared';
import { ListVideo } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PasswordInput } from '@/components/auth/password-input';
import { RequireAccount } from '@/components/layout/require-account';
import { Button } from '@/components/ui/button';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { useConfigureMarathon, useCreateRoom, usePlaylist } from '@/lib/queries/rooms';
import { formatRuntime } from '@/lib/utils';
import { MoviePicker } from './movie-picker';
import { ControlPolicyRadio, fromLocalInput, VisibilityRadio } from './room-form-fields';

type In = z.input<typeof createRoomSchema>;
type Out = z.output<typeof createRoomSchema>;

const FIELDS = [
  'name',
  'description',
  'visibility',
  'password',
  'movieId',
  'allowGuests',
  'controlPolicy',
  'maxMembers',
  'scheduledFor',
] as const;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MarathonOptions({
  playlistId,
  countdown,
  intermission,
  voting,
  onChange,
}: {
  playlistId: string;
  countdown: number;
  intermission: number;
  voting: boolean;
  onChange: (patch: Partial<{ countdown: number; intermission: number; voting: boolean }>) => void;
}) {
  const playlist = usePlaylist(playlistId);
  return (
    <Section
      title="Marathon"
      description="The playlist plays in order for everyone, with a countdown before each title and a break in between."
    >
      {playlist.isLoading ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : playlist.isError || !playlist.data ? (
        <p role="alert" className="text-sm text-danger">
          That playlist isn’t available. Remove it from the link or pick another playlist from the
          room later.
        </p>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border-strong bg-secondary p-3">
          <span className="grid size-11 place-items-center rounded-lg bg-primary/15 text-primary">
            <ListVideo className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{playlist.data.name}</p>
            <p className="text-xs text-muted">
              {playlist.data.playableCount} of {playlist.data.itemCount} titles playable
              {playlist.data.totalRuntimeSec
                ? `, ${formatRuntime(Math.round(playlist.data.totalRuntimeSec / 60))} total`
                : ''}
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Countdown (seconds)"
          htmlFor="marathon-countdown"
          hint="0–60, before each title starts."
        >
          <Input
            type="number"
            min={0}
            max={60}
            value={countdown}
            onChange={(e) => onChange({ countdown: Number(e.target.value) })}
          />
        </FormField>
        <FormField
          label="Intermission (seconds)"
          htmlFor="marathon-intermission"
          hint="0–1800, between titles."
        >
          <Input
            type="number"
            min={0}
            max={1800}
            value={intermission}
            onChange={(e) => onChange({ intermission: Number(e.target.value) })}
          />
        </FormField>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="marathon-voting">Let the room vote on what’s next</Label>
          <p className="text-xs text-muted">During intermission, members pick the next title.</p>
        </div>
        <Switch
          id="marathon-voting"
          checked={voting}
          onCheckedChange={(v) => onChange({ voting: v })}
        />
      </div>
    </Section>
  );
}

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const playlistId = params.get('playlistId');
  const initialMovie = params.get('movieId') ?? undefined;
  const create = useCreateRoom();
  const configure = useConfigureMarathon();
  const [marathon, setMarathon] = React.useState({
    countdown: 10,
    intermission: 30,
    voting: false,
  });
  const [scheduled, setScheduled] = React.useState('');

  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: {
      name: '',
      description: '',
      visibility: 'PUBLIC',
      password: undefined,
      movieId: playlistId ? undefined : initialMovie,
      allowGuests: false,
      controlPolicy: 'HOSTS',
      maxMembers: 20,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const visibility = form.watch('visibility');

  const marathonValid =
    !playlistId ||
    (Number.isInteger(marathon.countdown) &&
      marathon.countdown >= 0 &&
      marathon.countdown <= 60 &&
      Number.isInteger(marathon.intermission) &&
      marathon.intermission >= 0 &&
      marathon.intermission <= 1800);

  const onSubmit = async (values: Out) => {
    if (!marathonValid) {
      form.setError('root.server', {
        type: 'client',
        message: 'Countdown must be 0–60 s and intermission 0–1800 s.',
      });
      return;
    }
    const scheduledFor = fromLocalInput(scheduled);
    let room;
    try {
      ({ room } = await create.mutateAsync({
        ...values,
        description: values.description || undefined,
        password: values.visibility === 'PASSWORD' ? values.password : undefined,
        scheduledFor,
      }));
    } catch (error) {
      applyApiErrors(error, form.setError, FIELDS);
      return;
    }
    if (playlistId) {
      try {
        await configure.mutateAsync({
          roomId: room.id,
          playlistId,
          countdownSec: marathon.countdown,
          intermissionSec: marathon.intermission,
          votingEnabled: marathon.voting,
        });
        toast.success('Room created with your marathon ready');
      } catch (error) {
        toast.error('Room created, but the marathon couldn’t be set up', {
          description: errorMessage(error),
        });
      }
    } else {
      toast.success(`Room ${room.code} is open`);
    }
    router.push(`/rooms/${room.code}`);
  };

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-8">
      <FormError message={errors.root?.server?.message} />
      <Section title="The basics">
        <FormField label="Room name" htmlFor="room-name" error={errors.name?.message}>
          <Input
            maxLength={60}
            placeholder="Friday creature feature"
            autoFocus
            {...form.register('name')}
          />
        </FormField>
        <FormField
          label="Description"
          htmlFor="room-description"
          error={errors.description?.message}
          hint="Optional. What’s the plan?"
        >
          <Textarea rows={2} maxLength={280} {...form.register('description')} />
        </FormField>
      </Section>

      {playlistId ? (
        <MarathonOptions
          playlistId={playlistId}
          countdown={marathon.countdown}
          intermission={marathon.intermission}
          voting={marathon.voting}
          onChange={(patch) => setMarathon((m) => ({ ...m, ...patch }))}
        />
      ) : (
        <Section
          title="What are you watching?"
          description="Pick a title now or choose one once everyone’s in."
        >
          <Controller
            control={form.control}
            name="movieId"
            render={({ field }) => (
              <MoviePicker
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.movieId}
              />
            )}
          />
          {errors.movieId ? (
            <p className="text-xs font-medium text-danger">{errors.movieId.message}</p>
          ) : null}
        </Section>
      )}

      <Section title="Who can join">
        <Controller
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <VisibilityRadio value={field.value} onChange={field.onChange} name={field.name} />
          )}
        />
        {visibility === 'PASSWORD' ? (
          <FormField
            label="Room password"
            htmlFor="room-password"
            error={errors.password?.message}
            hint="4–64 characters. Share it with your guests."
          >
            <PasswordInput
              autoComplete="new-password"
              maxLength={64}
              {...form.register('password')}
            />
          </FormField>
        ) : null}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/60 p-3">
          <div>
            <Label htmlFor="room-guests">Allow guests</Label>
            <p className="text-xs text-muted">
              People without an account can join with just a display name.
            </p>
          </div>
          <Controller
            control={form.control}
            name="allowGuests"
            render={({ field }) => (
              <Switch id="room-guests" checked={!!field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
        <FormField
          label="Maximum members"
          htmlFor="room-max"
          error={errors.maxMembers?.message}
          hint="2–100 people, including you."
        >
          <Input
            type="number"
            min={2}
            max={100}
            className="w-32"
            {...form.register('maxMembers', { valueAsNumber: true })}
          />
        </FormField>
      </Section>

      <Section title="Playback controls">
        <Controller
          control={form.control}
          name="controlPolicy"
          render={({ field }) => (
            <ControlPolicyRadio value={field.value ?? 'HOSTS'} onChange={field.onChange} />
          )}
        />
      </Section>

      <Section
        title="Schedule"
        description="Optional. Shows a start time on the room card — the room opens right away either way."
      >
        <FormField label="Starts at" htmlFor="room-scheduled" error={errors.scheduledFor?.message}>
          <Input
            type="datetime-local"
            className="w-full sm:w-64"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
        </FormField>
      </Section>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="lg" loading={isSubmitting} loadingText="Opening room">
          {playlistId ? 'Create room and marathon' : 'Open the room'}
        </Button>
      </div>
    </form>
  );
}

export function CreateRoomView() {
  return (
    <RequireAccount feature="Hosting a watch party">
      {() => (
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-6 lg:pt-10">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Start a watch party
          </h1>
          <p className="mb-8 mt-1 text-sm text-muted">
            You’ll get a room code and an invite link to share once it’s open.
          </p>
          <div className="rounded-2xl border border-border bg-surface/50 p-5 sm:p-7">
            <Form />
          </div>
        </div>
      )}
    </RequireAccount>
  );
}
