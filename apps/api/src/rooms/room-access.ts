import type { ControlPolicy, RoomRole } from '@prisma/client';

/** Pure permission rules for rooms; the single source of truth for server-side checks. */
export const RoomPermissions = {
  canControlPlayback(policy: ControlPolicy, role: RoomRole): boolean {
    if (role === 'HOST') return true;
    if (policy === 'EVERYONE') return true;
    return policy === 'HOSTS' && role === 'COHOST';
  },

  canModerate(role: RoomRole): boolean {
    return role === 'HOST' || role === 'COHOST';
  },

  /** Hosts may remove anyone but themselves; co-hosts may only remove regular members. */
  canRemove(actor: RoomRole, target: RoomRole): boolean {
    if (actor === 'HOST') return target !== 'HOST';
    if (actor === 'COHOST') return target === 'MEMBER';
    return false;
  },

  canEditRoom(role: RoomRole): boolean {
    return role === 'HOST';
  },

  canManageRoles(role: RoomRole): boolean {
    return role === 'HOST';
  },

  canInvite(role: RoomRole, visibility: 'PUBLIC' | 'PRIVATE' | 'PASSWORD' | 'FRIENDS'): boolean {
    return role !== 'MEMBER' || visibility === 'PUBLIC';
  },
};
