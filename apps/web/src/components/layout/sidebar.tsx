'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isActive, settingsNav, sidebarSections, type NavItem } from './nav-items';

const STORAGE_KEY = 'jandi:sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggle = () => {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !value;
    });
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item, tab);
    const link = (
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={cn(
          'group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors focus-ring',
          active
            ? 'bg-glass-3 text-foreground'
            : 'text-muted hover:bg-glass-2 hover:text-foreground',
          collapsed && 'justify-center px-0',
        )}
      >
        {active ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand"
          />
        ) : null}
        <item.icon
          className={cn('size-[18px] shrink-0', active && 'text-primary')}
          aria-hidden="true"
        />
        {collapsed ? null : <span className="truncate">{item.label}</span>}
      </Link>
    );
    return (
      <li key={item.href}>
        {collapsed ? (
          <Tooltip label={item.label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        )}
      </li>
    );
  };

  return (
    <aside
      aria-label="App sections"
      className={cn(
        'sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-r border-border bg-background/60 transition-[width] duration-300 ease-[var(--ease-cinema)] lg:flex',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <nav aria-label="Sections" className="scrollbar-none flex-1 overflow-y-auto px-3 py-4">
        {sidebarSections.map((section) => (
          <div key={section.label} className="mb-5">
            {collapsed ? (
              <div className="mx-3 mb-2 h-px bg-border" aria-hidden="true" />
            ) : (
              <p className="mb-1.5 px-3 text-xs font-medium text-subtle">{section.label}</p>
            )}
            <ul className="grid gap-0.5" aria-label={collapsed ? section.label : undefined}>
              {section.items.map(renderItem)}
            </ul>
          </div>
        ))}
      </nav>
      <div className="grid gap-1 border-t border-border px-3 py-3">
        <ul>{renderItem(settingsNav)}</ul>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm text-muted transition-colors hover:bg-glass-2 hover:text-foreground focus-ring',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-[18px]" aria-hidden="true" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
