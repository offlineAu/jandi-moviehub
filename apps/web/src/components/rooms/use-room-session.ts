'use client';

import {
  SocketEvents,
  type MarathonSnapshot,
  type PlaybackState,
  type ReactionBurst,
  type RoomMemberPresence,
  type RoomSnapshot,
} from '@jandi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import {
  canControlFor,
  roomKeys,
  type ControlPolicy,
  type Room,
  type RoomRole,
} from '@/lib/queries/rooms';
import { RoomSyncEngine, type SyncSocket, type SyncStats } from '@/lib/sync/room-sync';
import { acquireSocket, releaseSocket } from '@/lib/sync/socket';

export interface FloatingBurst extends ReactionBurst {
  key: string;
  x: number;
}

export interface RoomSession {
  socket: Socket | null;
  engine: RoomSyncEngine | null;
  joined: boolean;
  joinError: string | null;
  connected: boolean;
  playback: PlaybackState | null;
  members: RoomMemberPresence[];
  marathon: MarathonSnapshot | null;
  setMarathon: (m: MarathonSnapshot | null) => void;
  myUserId: string | null;
  myRole: RoomRole | null;
  controlPolicy: ControlPolicy;
  canControl: boolean;
  stats: SyncStats | null;
  needsInteraction: boolean;
  bursts: FloatingBurst[];
  serverNow: () => number;
  rejoin: () => void;
}

/**
 * Owns the realtime side of a room: the shared socket, the RoomSyncEngine, presence, marathon
 * state and room lifecycle events (closed / kicked / host transfer / reconnect).
 */
export function useRoomSession(room: Room): RoomSession {
  const router = useRouter();
  const qc = useQueryClient();
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [engine, setEngine] = React.useState<RoomSyncEngine | null>(null);
  const [joined, setJoined] = React.useState(false);
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [playback, setPlayback] = React.useState<PlaybackState | null>(null);
  const [members, setMembers] = React.useState<RoomMemberPresence[]>([]);
  const [marathon, setMarathon] = React.useState<MarathonSnapshot | null>(null);
  const [you, setYou] = React.useState<RoomSnapshot['you'] | null>(null);
  const [controlPolicy, setControlPolicy] = React.useState<ControlPolicy>(room.controlPolicy);
  const [stats, setStats] = React.useState<SyncStats | null>(null);
  const [needsInteraction, setNeedsInteraction] = React.useState(false);
  const [bursts, setBursts] = React.useState<FloatingBurst[]>([]);
  const joinRef = React.useRef<() => void>(() => undefined);

  const roomId = room.id;
  const roomCode = room.code;

  React.useEffect(() => {
    let disposed = false;
    const s = acquireSocket();
    const e = new RoomSyncEngine(s as unknown as SyncSocket, roomId, {
      onState: (state) => !disposed && setPlayback(state),
      onStats: (st) => !disposed && setStats(st),
      onNeedsInteraction: (needed) => !disposed && setNeedsInteraction(needed),
      onError: (message) => toast.error(message),
    });
    setSocket(s);
    setEngine(e);
    setConnected(s.connected);

    const join = async () => {
      try {
        const snap = await e.join();
        if (disposed) return;
        setJoined(true);
        setJoinError(null);
        setMembers(snap.members);
        setMarathon(snap.marathon);
        setYou(snap.you);
        setControlPolicy(snap.room.controlPolicy);
        setPlayback(snap.playback);
      } catch (error) {
        if (disposed) return;
        setJoinError(error instanceof Error ? error.message : 'Couldn’t join the room');
      }
    };
    joinRef.current = () => void join();

    let wasDisconnected = false;
    const onConnect = () => {
      setConnected(true);
      if (wasDisconnected) {
        wasDisconnected = false;
        void join(); // the snapshot is the source of truth after a reconnect
      }
    };
    const onDisconnect = () => {
      wasDisconnected = true;
      setConnected(false);
    };
    const onConnectError = () => setConnected(false);
    const onPresence = (p: { roomId: string; members: RoomMemberPresence[] }) => {
      if (p.roomId === roomId) setMembers(p.members);
    };
    const onMarathon = (m: MarathonSnapshot | null) => {
      if (!m || m.roomId === roomId) setMarathon(m);
    };
    const onHostTransfer = (p: { roomId: string; toUserId: string; reason: string }) => {
      if (p.roomId !== roomId) return;
      setYou((prev) => (prev && prev.userId === p.toUserId ? { ...prev, role: 'HOST' } : prev));
      void qc.invalidateQueries({ queryKey: roomKeys.byCodeAll(roomCode) });
      const who = membersRef.current.find((m) => m.userId === p.toUserId)?.displayName ?? 'Someone';
      const mine = youRef.current?.userId === p.toUserId;
      toast(mine ? 'You’re the host now' : `${who} is now the host`, {
        description:
          p.reason === 'disconnected'
            ? 'The previous host lost connection.'
            : p.reason === 'left'
              ? 'The previous host left the room.'
              : undefined,
      });
    };
    const onUpdated = (r: Partial<Room>) => {
      if (r.id && r.id !== roomId) return;
      if (r.controlPolicy) setControlPolicy(r.controlPolicy);
      void qc.invalidateQueries({ queryKey: roomKeys.byCodeAll(roomCode) });
    };
    const onClosed = (p: { roomId: string; by: string }) => {
      if (p.roomId !== roomId) return;
      toast(p.by === 'admin' ? 'A moderator closed this room' : 'The host closed this room');
      void qc.invalidateQueries({ queryKey: roomKeys.all });
      router.push('/rooms');
    };
    const onKicked = (p: { roomId: string; banned: boolean; reason: string | null }) => {
      if (p.roomId !== roomId) return;
      toast.error(p.banned ? 'You were banned from this room' : 'You were removed from this room', {
        description: p.reason ?? undefined,
      });
      void qc.invalidateQueries({ queryKey: roomKeys.all });
      router.push('/rooms');
    };
    const onBurst = (b: ReactionBurst) => {
      if (b.roomId && b.roomId !== roomId) return;
      const key = `${b.userId}-${b.at}-${Math.random().toString(36).slice(2, 7)}`;
      setBursts((list) => [...list.slice(-24), { ...b, key, x: 8 + Math.random() * 84 }]);
      window.setTimeout(() => setBursts((list) => list.filter((x) => x.key !== key)), 2800);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on(SocketEvents.MEMBER_PRESENCE, onPresence);
    s.on(SocketEvents.MARATHON_STATE, onMarathon);
    s.on(SocketEvents.HOST_TRANSFER, onHostTransfer);
    s.on(SocketEvents.ROOM_UPDATED, onUpdated);
    s.on(SocketEvents.ROOM_CLOSED, onClosed);
    s.on(SocketEvents.MEMBER_KICKED, onKicked);
    s.on(SocketEvents.REACTION_BURST, onBurst);
    void join();

    return () => {
      disposed = true;
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
      s.off(SocketEvents.MEMBER_PRESENCE, onPresence);
      s.off(SocketEvents.MARATHON_STATE, onMarathon);
      s.off(SocketEvents.HOST_TRANSFER, onHostTransfer);
      s.off(SocketEvents.ROOM_UPDATED, onUpdated);
      s.off(SocketEvents.ROOM_CLOSED, onClosed);
      s.off(SocketEvents.MEMBER_KICKED, onKicked);
      s.off(SocketEvents.REACTION_BURST, onBurst);
      if (s.connected) s.emit(SocketEvents.ROOM_LEAVE, { roomId });
      e.destroy();
      releaseSocket();
    };
  }, [roomId, roomCode, qc, router]);

  const membersRef = React.useRef(members);
  const youRef = React.useRef(you);
  React.useEffect(() => {
    membersRef.current = members;
    youRef.current = you;
  });

  const myUserId = you?.userId ?? null;
  const myRole = (members.find((m) => m.userId === myUserId)?.role ??
    you?.role ??
    null) as RoomRole | null;
  const canControl = joined && canControlFor(controlPolicy, myRole);

  React.useEffect(() => {
    engine?.setCanControl(canControl);
  }, [engine, canControl]);

  const serverNow = React.useCallback(() => (engine ? engine.serverNow : Date.now()), [engine]);

  return {
    socket,
    engine,
    joined,
    joinError,
    connected,
    playback,
    members,
    marathon,
    setMarathon,
    myUserId,
    myRole,
    controlPolicy,
    canControl,
    stats,
    needsInteraction,
    bursts,
    serverNow,
    rejoin: () => joinRef.current(),
  };
}
