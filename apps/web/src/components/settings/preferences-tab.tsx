'use client';

import type { Preferences } from '@jandi/shared';
import { Slider } from 'radix-ui';
import * as React from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { resolvePreferences } from '@/lib/queries/auth';
import { useUpdateProfile } from '@/lib/queries/profile';
import type { Me } from '@/lib/types';
import { SettingRow, SettingsSection } from './section';

export function PreferencesTab({ me }: { me: Me }) {
  const prefs = resolvePreferences(me);
  const update = useUpdateProfile();
  const [volume, setVolume] = React.useState(Math.round(prefs.defaultVolume * 100));
  React.useEffect(() => setVolume(Math.round(prefs.defaultVolume * 100)), [prefs.defaultVolume]);

  const save = (patch: Partial<Preferences>, message: string) =>
    update.mutate(
      { preferences: patch },
      {
        onSuccess: () => toast.success(message),
        onError: (error) =>
          toast.error(errorMessage(error, 'Couldn’t save that preference. Try again.')),
      },
    );

  const onNotifications = async (enabled: boolean) => {
    if (!enabled) {
      save({ browserNotifications: false }, 'Browser notifications turned off');
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('This browser doesn’t support notifications.');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast.error('Notifications are blocked', {
        description: 'Allow notifications for this site in your browser settings, then try again.',
      });
      return;
    }
    save({ browserNotifications: true }, 'Browser notifications turned on');
  };

  return (
    <div className="grid gap-6">
      <SettingsSection
        title="Playback"
        description="Applies when you watch alone and in watch parties."
      >
        <div className="divide-y divide-border">
          <SettingRow
            id="pref-autoplay"
            label="Autoplay next title"
            description="Start the next movie in a playlist or marathon automatically."
            control={
              <Switch
                id="pref-autoplay"
                aria-describedby="pref-autoplay-desc"
                checked={prefs.autoplayNext}
                onCheckedChange={(v) =>
                  save({ autoplayNext: v }, v ? 'Autoplay turned on' : 'Autoplay turned off')
                }
              />
            }
          />
          <SettingRow
            id="pref-captions"
            label="Captions on by default"
            description="Turn on subtitles whenever a title has them."
            control={
              <Switch
                id="pref-captions"
                aria-describedby="pref-captions-desc"
                checked={prefs.captionsByDefault}
                onCheckedChange={(v) =>
                  save(
                    { captionsByDefault: v },
                    v ? 'Captions will start on' : 'Captions will start off',
                  )
                }
              />
            }
          />
          <div className="py-4 last:pb-0">
            <div className="flex items-center justify-between gap-4">
              <span id="pref-volume-label" className="text-sm font-medium">
                Default volume
              </span>
              <span className="text-sm tabular-nums text-muted" aria-hidden="true">
                {volume}%
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              Used until you change the volume in the player.
            </p>
            <Slider.Root
              className="relative mt-4 flex h-5 w-full max-w-sm touch-none select-none items-center"
              min={0}
              max={100}
              step={5}
              value={[volume]}
              onValueChange={([v]) => setVolume(v ?? 0)}
              onValueCommit={([v]) =>
                save({ defaultVolume: (v ?? 0) / 100 }, `Default volume set to ${v}%`)
              }
              aria-labelledby="pref-volume-label"
            >
              <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/15">
                <Slider.Range className="absolute h-full bg-brand" />
              </Slider.Track>
              <Slider.Thumb
                className="block size-5 rounded-full bg-white shadow-md focus-ring"
                aria-label="Default volume"
                aria-valuetext={`${volume}%`}
              />
            </Slider.Root>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Accessibility & alerts">
        <div className="divide-y divide-border">
          <SettingRow
            id="pref-motion"
            label="Reduce motion"
            description="Turn off animated transitions across Jandi, even if your device allows them."
            control={
              <Switch
                id="pref-motion"
                aria-describedby="pref-motion-desc"
                checked={prefs.reduceMotion}
                onCheckedChange={(v) =>
                  save({ reduceMotion: v }, v ? 'Reduced motion on' : 'Reduced motion off')
                }
              />
            }
          />
          <SettingRow
            id="pref-notifications"
            label="Browser notifications"
            description="Get a desktop alert for room invites and when a scheduled watch party starts."
            control={
              <Switch
                id="pref-notifications"
                aria-describedby="pref-notifications-desc"
                checked={prefs.browserNotifications}
                onCheckedChange={(v) => void onNotifications(v)}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
