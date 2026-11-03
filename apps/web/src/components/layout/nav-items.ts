import {
  Bell,
  Clapperboard,
  Clock,
  Compass,
  Heart,
  History,
  House,
  ListVideo,
  Library,
  ListPlus,
  Search,
  Settings,
  Users,
  Tv,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefix used to compute the active state. */
  match?: string;
  matchTab?: string;
}

export const primaryNav: NavItem[] = [
  { href: '/browse', label: 'Browse', icon: Compass, match: '/browse' },
  { href: '/series', label: 'Series', icon: Tv, match: '/series' },
  { href: '/rooms', label: 'Rooms', icon: Clapperboard, match: '/rooms' },
  { href: '/library', label: 'Library', icon: Library, match: '/library' },
];

export const mobileTabs: NavItem[] = [
  { href: '/', label: 'Home', icon: House, match: '/' },
  { href: '/browse', label: 'Browse', icon: Compass, match: '/browse' },
  { href: '/search', label: 'Search', icon: Search, match: '/search' },
  { href: '/rooms', label: 'Rooms', icon: Clapperboard, match: '/rooms' },
  { href: '/library', label: 'Library', icon: Library, match: '/library' },
];

export const sidebarSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Watch',
    items: [
      { href: '/', label: 'Home', icon: House, match: '/' },
      { href: '/browse', label: 'Browse', icon: Compass, match: '/browse' },
      { href: '/series', label: 'Series', icon: Tv, match: '/series' },
      { href: '/rooms', label: 'Rooms', icon: Clapperboard, match: '/rooms' },
    ],
  },
  {
    label: 'Your library',
    items: [
      {
        href: '/library?tab=continue',
        label: 'Continue watching',
        icon: Clock,
        match: '/library',
        matchTab: 'continue',
      },
      {
        href: '/library?tab=watchlists',
        label: 'Watchlists',
        icon: ListPlus,
        match: '/library',
        matchTab: 'watchlists',
      },
      {
        href: '/library?tab=favorites',
        label: 'Favorites',
        icon: Heart,
        match: '/library',
        matchTab: 'favorites',
      },
      {
        href: '/library?tab=history',
        label: 'History',
        icon: History,
        match: '/library',
        matchTab: 'history',
      },
    ],
  },
  {
    label: 'Together',
    items: [
      { href: '/playlists', label: 'Playlists', icon: ListVideo, match: '/playlists' },
      { href: '/friends', label: 'Friends', icon: Users, match: '/friends' },
      { href: '/notifications', label: 'Notifications', icon: Bell, match: '/notifications' },
    ],
  },
];

export const settingsNav: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: Settings,
  match: '/settings',
};

export function isActive(pathname: string, item: NavItem, tab?: string | null): boolean {
  const match = item.match ?? item.href;
  if (match === '/') return pathname === '/';
  const inPath = pathname === match || pathname.startsWith(`${match}/`);
  if (!inPath) return false;
  if (item.matchTab) return (tab ?? 'continue') === item.matchTab && pathname === match;
  return true;
}
