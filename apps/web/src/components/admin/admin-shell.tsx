'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { TopNav } from '@/components/layout/top-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Spinner } from '@/components/ui/spinner';
import { useMe } from '@/lib/queries/auth';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';
import { canAccessSection, defaultSectionFor, isStaff } from './admin-utils';
import { ForbiddenState } from './admin-ui';
import { ADMIN_SECTIONS, sectionForPath, type AdminSection } from './sections';

const StaffContext = React.createContext<(Me & { role: 'ADMIN' | 'MODERATOR' }) | null>(null);

/** The signed-in staff member (only available inside the admin shell). */
export function useStaff() {
  const me = React.useContext(StaffContext);
  if (!me) throw new Error('useStaff must be used inside <AdminShell>');
  return me;
}

function SectionNav({
  sections,
  pathname,
  orientation,
}: {
  sections: AdminSection[];
  pathname: string;
  orientation: 'vertical' | 'horizontal';
}) {
  const current = sectionForPath(pathname);
  const activeRef = React.useRef<HTMLAnchorElement>(null);
  React.useEffect(() => {
    if (orientation === 'horizontal')
      activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [orientation, current?.id]);

  if (orientation === 'horizontal') {
    return (
      <nav aria-label="Admin sections" className="lg:hidden">
        <ul className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          {sections.map((s) => {
            const active = current?.id === s.id;
            return (
              <li key={s.id} className="shrink-0">
                <Link
                  ref={active ? activeRef : undefined}
                  href={s.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-ring',
                    active
                      ? 'border-primary/50 bg-primary/15 text-foreground'
                      : 'border-border-strong text-muted hover:text-foreground',
                  )}
                >
                  <s.icon className={cn('size-4', active && 'text-primary')} aria-hidden="true" />
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  const groups = [...new Set(sections.map((s) => s.group))];
  return (
    <nav aria-label="Admin sections" className="scrollbar-none flex-1 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group} className="mb-5">
          <p className="mb-1.5 px-3 text-xs font-medium text-subtle">{group}</p>
          <ul className="grid gap-0.5">
            {sections
              .filter((s) => s.group === group)
              .map((s) => {
                const active = current?.id === s.id;
                return (
                  <li key={s.id}>
                    <Link
                      href={s.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors focus-ring',
                        active
                          ? 'bg-white/[0.07] text-foreground'
                          : 'text-muted hover:bg-white/[0.04] hover:text-foreground',
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand"
                        />
                      ) : null}
                      <s.icon
                        className={cn('size-[18px] shrink-0', active && 'text-primary')}
                        aria-hidden="true"
                      />
                      <span className="truncate">{s.label}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Frame({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <div className="flex flex-1">
        {aside}
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 md:pb-12 lg:px-10 lg:pt-8"
        >
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}

/**
 * Client-side guard + layout for /admin. The proxy redirects visitors without a session cookie;
 * the API is the authority on every request (403s are rendered by each section).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname() || '/admin';
  const user = me.data;
  const staffRole = user && !user.isGuest && isStaff(user.role) ? user.role : null;
  const section = sectionForPath(pathname);

  React.useEffect(() => {
    if (me.isSuccess && me.data === null) {
      router.replace(`/login?next=${encodeURIComponent(`${pathname}${window.location.search}`)}`);
    }
  }, [me.isSuccess, me.data, pathname, router]);

  // Moderators have no overview; send them to their first section.
  const redirectModerator = staffRole === 'MODERATOR' && section?.id === 'overview';
  React.useEffect(() => {
    if (redirectModerator) router.replace(`/admin/${defaultSectionFor('MODERATOR')}`);
  }, [redirectModerator, router]);

  if (me.isLoading || (me.isSuccess && me.data === null) || redirectModerator) {
    return (
      <Frame>
        <div className="grid min-h-[50vh] place-items-center text-muted">
          <Spinner className="size-6" label="Checking your access" />
        </div>
      </Frame>
    );
  }
  if (me.isError) {
    return (
      <Frame>
        <ErrorState
          title="We couldn’t check your access"
          error={me.error}
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        />
      </Frame>
    );
  }
  if (!user || !staffRole) {
    return (
      <Frame>
        <ForbiddenState
          className="mx-auto mt-6 max-w-2xl"
          title="The admin area is for staff only"
          description={
            user?.isGuest
              ? 'Guest sessions can’t open the admin area. Sign in with a staff account to continue.'
              : 'Your account doesn’t have the administrator or moderator role. If you need access, ask an administrator to grant it.'
          }
          action={
            <Button asChild variant="secondary">
              <Link href="/">Back to Jandi</Link>
            </Button>
          }
        />
      </Frame>
    );
  }

  const staff = { ...user, role: staffRole };
  const visible = ADMIN_SECTIONS.filter((s) => canAccessSection(staffRole, s.id));
  const allowed = section ? canAccessSection(staffRole, section.id) : true;

  return (
    <StaffContext.Provider value={staff}>
      <Frame
        aside={
          <aside
            aria-label="Admin"
            className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col border-r border-border bg-background/60 lg:flex"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                <Shield className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold">Admin console</p>
                <p className="truncate text-xs text-muted">@{staff.username}</p>
              </div>
            </div>
            <SectionNav sections={visible} pathname={pathname} orientation="vertical" />
            <div className="border-t border-border px-6 py-3">
              <Badge variant={staffRole === 'ADMIN' ? 'primary' : 'neutral'}>
                {staffRole === 'ADMIN' ? 'Administrator' : 'Moderator'}
              </Badge>
            </div>
          </aside>
        }
      >
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
            <p className="flex items-center gap-2 font-display text-sm font-semibold text-muted">
              <Shield className="size-4 text-primary" aria-hidden="true" />
              Admin console
            </p>
            <Badge variant={staffRole === 'ADMIN' ? 'primary' : 'neutral'}>
              {staffRole === 'ADMIN' ? 'Administrator' : 'Moderator'}
            </Badge>
          </div>
          <div className="mb-6 lg:hidden">
            <SectionNav sections={visible} pathname={pathname} orientation="horizontal" />
          </div>
          {allowed ? (
            children
          ) : (
            <ForbiddenState
              title={`${section?.label ?? 'This section'} is for administrators`}
              description="Moderators can review reports, close rooms, remove reported messages and read the audit log."
              action={
                <Button asChild variant="secondary">
                  <Link href="/admin/reports">Go to reports</Link>
                </Button>
              }
            />
          )}
        </div>
      </Frame>
    </StaffContext.Provider>
  );
}
