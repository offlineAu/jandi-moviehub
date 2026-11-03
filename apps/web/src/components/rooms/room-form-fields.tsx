'use client';

import { Globe, KeyRound, Lock, Users } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import type { ControlPolicy, RoomVisibility } from '@/lib/queries/rooms';
import { cn } from '@/lib/utils';

export const VISIBILITY_OPTIONS: Array<{
  value: RoomVisibility;
  label: string;
  description: string;
  icon: typeof Globe;
}> = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Listed in Watch parties. Anyone with an account can join.',
    icon: Globe,
  },
  {
    value: 'FRIENDS',
    label: 'Friends',
    description: 'Only your friends can find and join it.',
    icon: Users,
  },
  {
    value: 'PASSWORD',
    label: 'Password',
    description: 'Anyone with the code and the password can join.',
    icon: KeyRound,
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    description: 'Hidden. People join with an invite link only.',
    icon: Lock,
  },
];

export const CONTROL_OPTIONS: Array<{ value: ControlPolicy; label: string; description: string }> =
  [
    {
      value: 'HOSTS',
      label: 'Host and co-hosts',
      description: 'You and anyone you promote can play, pause and seek.',
    },
    { value: 'HOST_ONLY', label: 'Host only', description: 'Only you control playback.' },
    { value: 'EVERYONE', label: 'Everyone', description: 'Any member can control playback.' },
  ];

export function VisibilityRadio({
  value,
  onChange,
  name,
}: {
  value: RoomVisibility;
  onChange: (v: RoomVisibility) => void;
  name: string;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as RoomVisibility)}
      name={name}
      aria-label="Who can join"
      className="grid gap-2 sm:grid-cols-2"
    >
      {VISIBILITY_OPTIONS.map((opt) => (
        <RadioGroup.Item
          key={opt.value}
          value={opt.value}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-ring',
            value === opt.value
              ? 'border-primary/60 bg-primary/10'
              : 'border-border-strong bg-secondary hover:border-white/20',
          )}
        >
          <span
            className={cn(
              'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
              value === opt.value ? 'bg-primary/20 text-primary' : 'bg-white/[0.05] text-muted',
            )}
          >
            <opt.icon className="size-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-medium">{opt.label}</span>
            <span className="block text-xs leading-relaxed text-muted">{opt.description}</span>
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export function ControlPolicyRadio({
  value,
  onChange,
}: {
  value: ControlPolicy;
  onChange: (v: ControlPolicy) => void;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as ControlPolicy)}
      aria-label="Who controls playback"
      className="grid gap-2"
    >
      {CONTROL_OPTIONS.map((opt) => (
        <RadioGroup.Item
          key={opt.value}
          value={opt.value}
          className={cn(
            'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-ring',
            value === opt.value
              ? 'border-primary/60 bg-primary/10'
              : 'border-border-strong bg-secondary hover:border-white/20',
          )}
        >
          <span className="grid size-4 shrink-0 place-items-center rounded-full border border-white/40">
            <RadioGroup.Indicator className="size-2 rounded-full bg-primary" />
          </span>
          <span>
            <span className="block text-sm font-medium">{opt.label}</span>
            <span className="block text-xs text-muted">{opt.description}</span>
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/** `datetime-local` value ↔ ISO string helpers. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
