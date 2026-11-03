'use client';

import { Clock, Heart, History, ListPlus } from 'lucide-react';
import { RequireAccount } from '@/components/layout/require-account';
import { useUrlState } from '@/components/browse/use-url-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContinueTab } from './continue-tab';
import { FavoritesTab } from './favorites-tab';
import { HistoryTab } from './history-tab';
import { WatchlistsTab } from './watchlists-tab';
import { SavedTvList } from '@/components/series/saved-tv';
import { RecentTvList } from '@/components/series/recent-tv';

const TABS = ['continue', 'watchlists', 'favorites', 'history'] as const;
type Tab = (typeof TABS)[number];

export function LibraryView() {
  const { params, set } = useUrlState();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'continue';

  return (
    <RequireAccount feature="Your library">
      {() => (
        <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Library</h1>
          <p className="mt-1 text-sm text-muted">Everything you’ve saved, started and finished.</p>
          <Tabs
            value={tab}
            onValueChange={(v) => set({ tab: v === 'continue' ? null : v, page: null })}
            className="mt-6"
          >
            <TabsList aria-label="Library sections">
              <TabsTrigger value="continue">
                <Clock aria-hidden="true" />
                Continue watching
              </TabsTrigger>
              <TabsTrigger value="watchlists">
                <ListPlus aria-hidden="true" />
                Watchlists
              </TabsTrigger>
              <TabsTrigger value="favorites">
                <Heart aria-hidden="true" />
                Favorites
              </TabsTrigger>
              <TabsTrigger value="history">
                <History aria-hidden="true" />
                History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="continue">
              <ContinueTab />
            </TabsContent>
            <TabsContent value="watchlists">
              <WatchlistsTab />
              <SavedTvList />
            </TabsContent>
            <TabsContent value="favorites">
              <FavoritesTab
                page={Math.max(1, Number(params.get('page')) || 1)}
                onPageChange={(p) => set({ page: p === 1 ? null : p }, { resetPage: false })}
              />
            </TabsContent>
            <TabsContent value="history">
              <HistoryTab
                page={Math.max(1, Number(params.get('page')) || 1)}
                onPageChange={(p) => set({ page: p === 1 ? null : p }, { resetPage: false })}
              />
              <RecentTvList />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </RequireAccount>
  );
}
