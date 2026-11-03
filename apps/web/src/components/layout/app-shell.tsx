'use client';

import * as React from 'react';
import { AmbientLight, ScrollProgress } from '@/components/motion/ambient';
import { useMe } from '@/lib/queries/auth';
import { AccountBanners } from './account-banners';
import { Footer } from './footer';
import { MobileTabBar } from './mobile-tab-bar';
import { Sidebar } from './sidebar';
import { TopNav } from './top-nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const showSidebar = !!me.data && !me.data.isGuest;
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <ScrollProgress />
      <AmbientLight />
      <TopNav />
      <AccountBanners />
      <div className="flex flex-1">
        {showSidebar ? (
          <React.Suspense fallback={null}>
            <Sidebar />
          </React.Suspense>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
        </div>
      </div>
      <MobileTabBar />
    </div>
  );
}
