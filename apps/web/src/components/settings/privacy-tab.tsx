'use client';

import type { Privacy, VisibilityLevel } from '@jandi/shared';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { useUpdateProfile } from '@/lib/queries/profile';
import type { Me } from '@/lib/types';
import { SettingRow, SettingsSection } from './section';

const LEVELS: Array<{ value: VisibilityLevel; label: string }> = [
  { value: 'PUBLIC', label: 'Everyone' },
  { value: 'FRIENDS', label: 'Friends only' },
  { value: 'PRIVATE', label: 'Only me' },
];

function VisibilitySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: VisibilityLevel;
  onChange: (v: VisibilityLevel) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as VisibilityLevel)}>
      <SelectTrigger id={id} aria-describedby={`${id}-desc`} className="h-10 w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {LEVELS.map((l) => (
          <SelectItem key={l.value} value={l.value}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrivacyTab({ me }: { me: Me }) {
  const update = useUpdateProfile();
  const privacy = me.privacy;
  const save = (patch: Partial<Privacy>) =>
    update.mutate(
      { privacy: patch },
      {
        onSuccess: () => toast.success('Privacy settings saved'),
        onError: (error) =>
          toast.error(errorMessage(error, 'Couldn’t save privacy settings. Try again.')),
      },
    );

  return (
    <div className="grid gap-6">
      <SettingsSection title="Who can see what">
        <div className="divide-y divide-border">
          <SettingRow
            id="privacy-profile"
            label="Profile"
            description="Your bio, favorites and stats on your public profile."
            control={
              <VisibilitySelect
                id="privacy-profile"
                value={privacy.profileVisibility}
                onChange={(v) => save({ profileVisibility: v })}
              />
            }
          />
          <SettingRow
            id="privacy-history"
            label="Watch history"
            description="The titles you’ve watched recently."
            control={
              <VisibilitySelect
                id="privacy-history"
                value={privacy.watchHistoryVisibility}
                onChange={(v) => save({ watchHistoryVisibility: v })}
              />
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection title="Presence & discovery">
        <div className="divide-y divide-border">
          <SettingRow
            id="privacy-online"
            label="Show when I’m online"
            description="Friends can see when you’re active and which room you’re in."
            control={
              <Switch
                id="privacy-online"
                aria-describedby="privacy-online-desc"
                checked={privacy.showOnlineStatus}
                onCheckedChange={(v) => save({ showOnlineStatus: v })}
              />
            }
          />
          <SettingRow
            id="privacy-discoverable"
            label="Let people find me"
            description="Appear in user search so others can send you friend requests."
            control={
              <Switch
                id="privacy-discoverable"
                aria-describedby="privacy-discoverable-desc"
                checked={privacy.discoverable}
                onCheckedChange={(v) => save({ discoverable: v })}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
