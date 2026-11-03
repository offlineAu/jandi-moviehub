import {
  Bell,
  Clapperboard,
  Megaphone,
  Ticket,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { safeNextPath } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  FRIEND_REQUEST: UserPlus,
  FRIEND_ACCEPTED: UserCheck,
  ROOM_INVITE: Ticket,
  ROOM_STARTING: Clapperboard,
  SYSTEM: Megaphone,
};

export function notificationIcon(type: string): LucideIcon {
  return ICONS[type] ?? Bell;
}

/** Notification links are app-relative paths; anything else is ignored. */
export function notificationHref(link: string | null | undefined): string | null {
  if (!link) return null;
  const safe = safeNextPath(link, '');
  return safe || null;
}

/** "9+" style badge text; null hides the badge. */
export function unreadBadge(count: number | null | undefined): string | null {
  if (!count || count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

/** Desktop alert only when opted in, permitted, and the tab isn't being looked at. */
export function shouldShowBrowserNotification(input: {
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
  visibility: DocumentVisibilityState;
}): boolean {
  return input.enabled && input.permission === 'granted' && input.visibility === 'hidden';
}
