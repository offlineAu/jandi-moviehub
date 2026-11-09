'use client';

import { parseExternalTitle } from '@jandi/shared';
import type { ExternalMedia } from '@jandi/shared';

import type { CreateRoomInput, MarathonSnapshot, UpdateRoomInput } from '@jandi/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import type { ItemList, MovieSummary, Paginated, PlaybackSource, PublicUser } from '../types';

// ---------- Types (docs/api/ROOMS.md) ----------
export type RoomVisibility = 'PUBLIC' | 'PRIVATE' | 'PASSWORD' | 'FRIENDS';
export type RoomRole = 'HOST' | 'COHOST' | 'MEMBER';
export type ControlPolicy = 'HOST_ONLY' | 'HOSTS' | 'EVERYONE';

export interface MovieBrief {
  id: string;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  year: number | null;
  runtimeMin: number | null;
  isDemo: boolean;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  description: string | null;
  visibility: RoomVisibility;
  status: 'OPEN' | 'CLOSED';
  allowGuests: boolean;
  controlPolicy: ControlPolicy;
  maxMembers: number;
  scheduledFor: string | null;
  createdAt: string;
  lastActiveAt: string;
  requiresPassword: boolean;
  host: PublicUser;
  movie: MovieBrief | null;
  memberCount: number;
  onlineCount: number;
  membership: { role: RoomRole; joinedAt: string } | null;
}

export interface RoomAccess {
  banned: boolean;
  isMember: boolean;
  requiresPassword: boolean;
  guestBlocked: boolean;
}

export interface RoomPreview {
  room: Room;
  access: RoomAccess;
}

export interface RoomInvite {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
  maxUses: number | null;
  uses: number;
}

export interface InvitePreview {
  room: Room;
  invite: { expiresAt: string; forSpecificUser: boolean };
}

export interface PlaylistBrief {
  id: string;
  name: string;
  description: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  collaborative: boolean;
  owner: PublicUser;
  itemCount: number;
  playableCount: number;
  totalRuntimeSec: number;
  canEdit: boolean;
  isOwner: boolean;
  items?: Array<{ id: string; position: number; movie: MovieBrief & { playable: boolean } }>;
}

export interface FriendEntry {
  user: PublicUser;
  since: string;
  online: boolean;
  watching: {
    roomCode: string | null;
    roomName: string | null;
    movieTitle: string | null;
    private: boolean;
  } | null;
}

export interface RoomPlaybackSources {
  embed?:
    | { provider: 'kisskh'; url: string; playbackMode: 'individual' }
    | {
        provider: 'vidsrc';
        url: string;
        playbackMode: 'synced';
        media: ExternalMedia;
        capabilities: { play: true; pause: true; seek: true; rate: false };
      };
  detailHref?: string;
  movieId: string | null;
  movie: MovieSummary;
  sources: PlaybackSource[];
}

export const roomKeys = {
  all: ['rooms'] as const,
  public: (q: string, page: number) => ['rooms', 'public', q, page] as const,
  mine: ['rooms', 'mine'] as const,
  friends: ['rooms', 'friends'] as const,
  byCode: (code: string, invite?: string | null) =>
    ['rooms', 'code', code, invite ?? null] as const,
  byCodeAll: (code: string) => ['rooms', 'code', code] as const,
  room: (id: string) => ['rooms', 'id', id] as const,
  sources: (id: string, assetKey: string | null) =>
    ['rooms', 'id', id, 'sources', assetKey] as const,
  marathon: (id: string) => ['rooms', 'id', id, 'marathon'] as const,
  invite: (token: string) => ['invites', token] as const,
  playlists: ['playlists', 'mine'] as const,
  playlist: (id: string) => ['playlists', id] as const,
  friendsList: ['friends'] as const,
};

const enc = encodeURIComponent;

// ---------- Discovery ----------
export function usePublicRooms(q: string, page: number) {
  return useQuery({
    queryKey: roomKeys.public(q, page),
    queryFn: () =>
      apiFetch<Paginated<Room>>('/rooms', { query: { q: q || undefined, page, pageSize: 12 } }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useMyRooms(enabled = true) {
  return useQuery({
    queryKey: roomKeys.mine,
    queryFn: () => apiFetch<ItemList<Room>>('/rooms/mine'),
    enabled,
  });
}

export function useFriendsRooms(enabled = true) {
  return useQuery({
    queryKey: roomKeys.friends,
    queryFn: () => apiFetch<ItemList<Room>>('/rooms/friends'),
    enabled,
  });
}

// ---------- Room lifecycle ----------
export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoomInput) =>
      apiFetch<{ room: Room }>('/rooms', {
        method: 'POST',
        body: (input.movieId && parseExternalTitle(input.movieId)
          ? { ...input, movieId: undefined, playbackSelection: parseExternalTitle(input.movieId) }
          : input) as Record<string, unknown>,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  });
}

export function useRoomByCode(code: string, invite?: string | null) {
  return useQuery({
    queryKey: roomKeys.byCode(code, invite),
    queryFn: () =>
      apiFetch<RoomPreview>(`/rooms/code/${enc(code)}`, { query: { invite: invite ?? undefined } }),
    retry: false,
  });
}

export function useJoinRoom(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      roomId,
      password,
      inviteToken,
    }: {
      roomId: string;
      password?: string;
      inviteToken?: string;
    }) =>
      apiFetch<{ membership: { role: RoomRole; alreadyMember: boolean } }>(
        `/rooms/${enc(roomId)}/join`,
        {
          method: 'POST',
          body: { ...(password ? { password } : {}), ...(inviteToken ? { inviteToken } : {}) },
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: roomKeys.byCodeAll(code) });
      void qc.invalidateQueries({ queryKey: roomKeys.mine });
    },
  });
}

export function useLeaveRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) =>
      apiFetch<void>(`/rooms/${enc(roomId)}/leave`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  });
}

export function useUpdateRoom(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRoomInput) =>
      apiFetch<{ room: Room }>(`/rooms/${enc(roomId)}`, {
        method: 'PATCH',
        body: input as Record<string, unknown>,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  });
}

export function useCloseRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => apiFetch<void>(`/rooms/${enc(roomId)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  });
}

// ---------- Moderation ----------
export type MemberAction =
  | { kind: 'role'; userId: string; role: 'COHOST' | 'MEMBER' }
  | { kind: 'kick'; userId: string }
  | { kind: 'ban'; userId: string; reason?: string }
  | { kind: 'transfer'; userId: string };

export function useMemberAction(roomId: string) {
  return useMutation({
    mutationFn: (action: MemberAction) => {
      const base = `/rooms/${enc(roomId)}`;
      switch (action.kind) {
        case 'role':
          return apiFetch<void>(`${base}/members/${enc(action.userId)}`, {
            method: 'PATCH',
            body: { role: action.role },
          });
        case 'kick':
          return apiFetch<void>(`${base}/members/${enc(action.userId)}`, { method: 'DELETE' });
        case 'ban':
          return apiFetch<void>(`${base}/bans/${enc(action.userId)}`, {
            method: 'POST',
            body: action.reason ? { reason: action.reason } : {},
          });
        case 'transfer':
          return apiFetch<void>(`${base}/transfer`, {
            method: 'POST',
            body: { userId: action.userId },
          });
      }
    },
  });
}

export function useCreateInvite(roomId: string) {
  return useMutation({
    mutationFn: (input: { maxUses?: number; expiresInHours?: number; inviteeUserId?: string }) =>
      apiFetch<{ invite: RoomInvite }>(`/rooms/${enc(roomId)}/invites`, {
        method: 'POST',
        body: input,
      }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: roomKeys.invite(token),
    queryFn: () => apiFetch<InvitePreview>(`/invites/${enc(token)}`),
    retry: false,
  });
}

// ---------- Playback ----------
export function useRoomPlaybackSources(roomId: string, assetKey: string | null, enabled = true) {
  return useQuery({
    queryKey: roomKeys.sources(roomId, assetKey),
    queryFn: () => apiFetch<RoomPlaybackSources>(`/rooms/${enc(roomId)}/playback-sources`),
    enabled: enabled && !!assetKey,
    staleTime: assetKey?.startsWith('kisskh-direct:') ? 60_000 : 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// ---------- Marathon ----------
export type MarathonCommand = 'start' | 'skip' | 'previous' | 'stop' | 'retry';

export function useMarathonCommand(roomId: string) {
  return useMutation({
    mutationFn: (command: MarathonCommand) =>
      apiFetch<{ marathon: MarathonSnapshot }>(`/rooms/${enc(roomId)}/marathon/${command}`, {
        method: 'POST',
      }),
  });
}

export function useConfigureMarathon() {
  return useMutation({
    mutationFn: ({
      roomId,
      ...input
    }: {
      roomId: string;
      playlistId: string;
      countdownSec: number;
      intermissionSec: number;
      votingEnabled: boolean;
    }) =>
      apiFetch<{ marathon: MarathonSnapshot }>(`/rooms/${enc(roomId)}/marathon`, {
        method: 'POST',
        body: input,
      }),
  });
}

export function useRemoveMarathon(roomId: string) {
  return useMutation({
    mutationFn: () => apiFetch<void>(`/rooms/${enc(roomId)}/marathon`, { method: 'DELETE' }),
  });
}

export function useMyPlaylists(enabled = true) {
  return useQuery({
    queryKey: roomKeys.playlists,
    queryFn: () => apiFetch<ItemList<PlaylistBrief>>('/playlists'),
    enabled,
  });
}

export function usePlaylist(id: string | null) {
  return useQuery({
    queryKey: roomKeys.playlist(id ?? ''),
    queryFn: () =>
      apiFetch<{ playlist: PlaylistBrief }>(`/playlists/${enc(id!)}`).then((r) => r.playlist),
    enabled: !!id,
  });
}

export function useFriendsList(enabled = true) {
  return useQuery({
    queryKey: roomKeys.friendsList,
    queryFn: () => apiFetch<ItemList<FriendEntry>>('/friends'),
    enabled,
  });
}

// ---------- Helpers ----------
export function canControlFor(policy: ControlPolicy, role: RoomRole | null | undefined): boolean {
  if (!role) return false;
  if (policy === 'EVERYONE') return true;
  if (policy === 'HOSTS') return role === 'HOST' || role === 'COHOST';
  return role === 'HOST';
}

export const VISIBILITY_LABEL: Record<RoomVisibility, string> = {
  PUBLIC: 'Public',
  PRIVATE: 'Private',
  PASSWORD: 'Password',
  FRIENDS: 'Friends',
};

export const JOIN_ERROR_MESSAGES: Record<string, string> = {
  BANNED: 'You’ve been banned from this room.',
  ROOM_FULL: 'This room is full. Try again when someone leaves.',
  WRONG_PASSWORD: 'That password isn’t right.',
  PASSWORD_REQUIRED: 'This room needs a password.',
  FRIENDS_ONLY: 'Only the host’s friends can join this room.',
  INVITE_REQUIRED: 'This room is invite-only. Ask the host for an invite link.',
  GUESTS_NOT_ALLOWED: 'This room doesn’t allow guests. Log in or create an account to join.',
  ROOM_CLOSED: 'This room has been closed.',
  NOT_FOUND: 'This room doesn’t exist or is private.',
};
