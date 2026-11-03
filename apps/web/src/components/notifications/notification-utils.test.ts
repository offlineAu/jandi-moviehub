import { Bell, UserPlus } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  notificationHref,
  notificationIcon,
  shouldShowBrowserNotification,
  unreadBadge,
} from './notification-utils';

describe('notification helpers', () => {
  it('maps types to icons with a fallback', () => {
    expect(notificationIcon('FRIEND_REQUEST')).toBe(UserPlus);
    expect(notificationIcon('SOMETHING_NEW')).toBe(Bell);
  });

  it('only follows app-relative links', () => {
    expect(notificationHref('/friends')).toBe('/friends');
    expect(notificationHref('/rooms/ABCD2345?x=1')).toBe('/rooms/ABCD2345?x=1');
    expect(notificationHref('https://evil.example')).toBeNull();
    expect(notificationHref('//evil.example')).toBeNull();
    expect(notificationHref(null)).toBeNull();
  });

  it('formats the unread badge', () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(undefined)).toBeNull();
    expect(unreadBadge(3)).toBe('3');
    expect(unreadBadge(12)).toBe('9+');
  });

  it('shows browser notifications only when enabled, granted and hidden', () => {
    const base = { enabled: true, permission: 'granted', visibility: 'hidden' } as const;
    expect(shouldShowBrowserNotification(base)).toBe(true);
    expect(shouldShowBrowserNotification({ ...base, enabled: false })).toBe(false);
    expect(shouldShowBrowserNotification({ ...base, permission: 'default' })).toBe(false);
    expect(shouldShowBrowserNotification({ ...base, permission: 'unsupported' })).toBe(false);
    expect(shouldShowBrowserNotification({ ...base, visibility: 'visible' })).toBe(false);
  });
});
