'use client';

import { KeyRound, Lock, SlidersHorizontal, UserRound } from 'lucide-react';
import { useUrlState } from '@/components/browse/use-url-state';
import { RequireAccount } from '@/components/layout/require-account';
import { CatalogAttribution } from '@/components/layout/footer';
import { SettingsSection } from './section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PreferencesTab } from './preferences-tab';
import { PrivacyTab } from './privacy-tab';
import { ProfileTab } from './profile-tab';
import { SecurityTab } from './security-tab';

const TABS = ['profile', 'preferences', 'privacy', 'security'] as const;
type Tab = (typeof TABS)[number];

export function SettingsView() {
  const { params, set } = useUrlState();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'profile';
  return (
    <RequireAccount feature="Settings">
      {(me) => (
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1>
          <Tabs
            value={tab}
            onValueChange={(v) => set({ tab: v === 'profile' ? null : v })}
            className="mt-6"
          >
            <TabsList aria-label="Settings sections">
              <TabsTrigger value="profile">
                <UserRound aria-hidden="true" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="preferences">
                <SlidersHorizontal aria-hidden="true" />
                Preferences
              </TabsTrigger>
              <TabsTrigger value="privacy">
                <Lock aria-hidden="true" />
                Privacy
              </TabsTrigger>
              <TabsTrigger value="security">
                <KeyRound aria-hidden="true" />
                Security
              </TabsTrigger>
            </TabsList>
            <TabsContent value="profile">
              <ProfileTab me={me} />
            </TabsContent>
            <TabsContent value="preferences">
              <PreferencesTab me={me} />
            </TabsContent>
            <TabsContent value="privacy">
              <PrivacyTab me={me} />
            </TabsContent>
            <TabsContent value="security">
              <SecurityTab />
            </TabsContent>
          </Tabs>
          <div className="mt-10">
            <SettingsSection title="About" description="Data sources and credits.">
              <CatalogAttribution />
            </SettingsSection>
          </div>
        </div>
      )}
    </RequireAccount>
  );
}
