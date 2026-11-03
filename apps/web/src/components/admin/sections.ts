import {
  ChartLine,
  Clapperboard,
  Film,
  Flag,
  Gauge,
  HardDriveUpload,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Tv,
  Search,
  type LucideIcon,
} from 'lucide-react';
import type { AdminSectionId } from './admin-utils';

export interface AdminSection {
  id: AdminSectionId;
  label: string;
  href: string;
  icon: LucideIcon;
  group: 'Insights' | 'People' | 'Catalog' | 'Moderation' | 'System';
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'overview', label: 'Overview', href: '/admin', icon: Gauge, group: 'Insights' },
  {
    id: 'analytics',
    label: 'Analytics',
    href: '/admin/analytics',
    icon: ChartLine,
    group: 'Insights',
  },
  { id: 'users', label: 'Users', href: '/admin/users', icon: Users, group: 'People' },
  { id: 'movies', label: 'Movies', href: '/admin/movies', icon: Film, group: 'Catalog' },
  { id: 'series', label: 'Series', href: '/admin/series', icon: Tv, group: 'Catalog' },
  { id: 'sources', label: 'Find sources', href: '/admin/sources', icon: Search, group: 'Catalog' },
  {
    id: 'licenses',
    label: 'Licenses',
    href: '/admin/licenses',
    icon: ShieldCheck,
    group: 'Catalog',
  },
  {
    id: 'media',
    label: 'Media assets',
    href: '/admin/media',
    icon: HardDriveUpload,
    group: 'Catalog',
  },
  { id: 'reports', label: 'Reports', href: '/admin/reports', icon: Flag, group: 'Moderation' },
  { id: 'rooms', label: 'Rooms', href: '/admin/rooms', icon: Clapperboard, group: 'Moderation' },
  { id: 'audit', label: 'Audit log', href: '/admin/audit', icon: ScrollText, group: 'Moderation' },
  {
    id: 'settings',
    label: 'Settings',
    href: '/admin/settings',
    icon: SlidersHorizontal,
    group: 'System',
  },
];

export function sectionForPath(pathname: string): AdminSection | undefined {
  const rest = pathname.replace(/^\/admin\/?/, '').split('/')[0] ?? '';
  return ADMIN_SECTIONS.find((s) => (rest ? s.href === `/admin/${rest}` : s.id === 'overview'));
}
