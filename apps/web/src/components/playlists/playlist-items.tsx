'use client';

import { Ban, ChevronDown, ChevronUp, GripVertical, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Artwork } from '@/components/movies/artwork';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import {
  useRemovePlaylistItem,
  useReorderPlaylist,
  type Playlist,
  type PlaylistItem,
} from '@/lib/queries/playlists';
import { cn, formatRuntime } from '@/lib/utils';
import { dropIndex, moveItem, orderChanged } from './playlist-utils';

interface DragState {
  id: string;
  pointerId: number;
  from: number;
  over: number;
  startY: number;
  dy: number;
  /** Height of the dragged row plus the list gap: how far other rows shift. */
  shift: number;
  /** Vertical centres of every row at drag start (document order). */
  centers: number[];
}

const KEYBOARD_COMMIT_DELAY_MS = 600;

function ItemRow({
  item,
  index,
  count,
  editable,
  showAddedBy,
  dragging,
  translate,
  onHandlePointerDown,
  onMove,
  onRemove,
  rowRef,
}: {
  item: PlaylistItem;
  index: number;
  count: number;
  editable: boolean;
  showAddedBy: boolean;
  dragging: boolean;
  translate: number;
  onHandlePointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onMove: (to: number, focus: 'handle' | 'up' | 'down') => void;
  onRemove: () => void;
  rowRef: (el: HTMLLIElement | null) => void;
}) {
  const { movie } = item;
  const runtime = item.durationSec
    ? formatRuntime(Math.round(item.durationSec / 60))
    : formatRuntime(movie.runtimeMin);
  const position = index + 1;

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      onMove(index - 1, 'handle');
    } else if (e.key === 'ArrowDown' && index < count - 1) {
      e.preventDefault();
      onMove(index + 1, 'handle');
    } else if (e.key === 'Home' && index > 0) {
      e.preventDefault();
      onMove(0, 'handle');
    } else if (e.key === 'End' && index < count - 1) {
      e.preventDefault();
      onMove(count - 1, 'handle');
    }
  };

  return (
    <li
      ref={rowRef}
      data-item-id={item.id}
      style={translate || dragging ? { transform: `translateY(${translate}px)` } : undefined}
      className={cn(
        'relative flex items-center gap-2 rounded-xl border border-border bg-surface p-2 sm:gap-3 sm:p-2.5',
        dragging
          ? 'z-10 border-primary/50 shadow-[var(--shadow-lift)]'
          : 'transition-[transform,border-color] duration-200 ease-[var(--ease-cinema)] hover:border-border-strong',
        !movie.playable && 'bg-surface/70',
      )}
    >
      {editable ? (
        <Tooltip label="Drag, or use arrow keys, to reorder" disabled={dragging}>
          <button
            type="button"
            data-handle={item.id}
            aria-label={`Reorder ${movie.title}, position ${position} of ${count}`}
            aria-describedby="playlist-reorder-help"
            onPointerDown={onHandlePointerDown}
            onKeyDown={onHandleKeyDown}
            className={cn(
              'grid h-11 w-7 shrink-0 touch-none place-items-center rounded-md text-subtle hover:bg-white/[0.06] hover:text-foreground focus-ring',
              dragging ? 'cursor-grabbing text-foreground' : 'cursor-grab',
            )}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        </Tooltip>
      ) : null}
      <span
        className="hidden w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-muted sm:block"
        aria-hidden="true"
      >
        {position}
      </span>
      <Link
        href={`/movies/${movie.id}`}
        className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md bg-surface-raised ring-1 ring-white/10 focus-ring sm:w-12"
        tabIndex={-1}
        aria-hidden="true"
      >
        <Artwork
          src={movie.posterUrl}
          alt=""
          sizes="48px"
          className={cn(!movie.playable && 'opacity-60 grayscale-[35%]')}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold sm:text-base">
          <span className="sr-only">{position}. </span>
          <Link href={`/movies/${movie.id}`} className="rounded hover:underline focus-ring">
            {movie.title}
          </Link>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {movie.year ? <span>{movie.year}</span> : null}
          {runtime ? <span>{runtime}</span> : null}
          {movie.genres.length ? (
            <span className="hidden truncate md:inline">{movie.genres.slice(0, 2).join(', ')}</span>
          ) : null}
          {showAddedBy && item.addedBy ? (
            <span className="hidden truncate lg:inline">Added by {item.addedBy.displayName}</span>
          ) : null}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {movie.playable ? (
            <Badge variant="playable">
              <Play className="fill-current" aria-hidden="true" />
              Playable
            </Badge>
          ) : (
            <Badge variant="outline">
              <Ban aria-hidden="true" />
              Not available
            </Badge>
          )}
          {movie.isDemo ? <Badge variant="demo">Demo</Badge> : null}
        </div>
      </div>
      {editable ? (
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex flex-col sm:flex-row sm:gap-1">
            <Tooltip label="Move up">
              <button
                type="button"
                data-move-up={item.id}
                aria-label={`Move ${movie.title} up`}
                disabled={index === 0}
                onClick={() => onMove(index - 1, 'up')}
                className="grid h-7 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground focus-ring disabled:opacity-30 sm:size-8 sm:rounded-full"
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip label="Move down">
              <button
                type="button"
                data-move-down={item.id}
                aria-label={`Move ${movie.title} down`}
                disabled={index === count - 1}
                onClick={() => onMove(index + 1, 'down')}
                className="grid h-7 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground focus-ring disabled:opacity-30 sm:size-8 sm:rounded-full"
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <Tooltip label="Remove from playlist">
            <button
              type="button"
              aria-label={`Remove ${movie.title} from the playlist`}
              onClick={onRemove}
              className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-ring"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      ) : null}
    </li>
  );
}

export function PlaylistItems({ playlist }: { playlist: Playlist }) {
  const reorder = useReorderPlaylist(playlist.id);
  const remove = useRemovePlaylistItem(playlist.id);
  const editable = playlist.canEdit;

  const [draft, setDraft] = React.useState<string[] | null>(null);
  const [drag, setDragState] = React.useState<DragState | null>(null);
  // Mirror for event handlers that may fire before a re-render (pointerup → lostpointercapture).
  const dragRef = React.useRef<DragState | null>(null);
  const setDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const [announcement, setAnnouncement] = React.useState('');
  const rowRefs = React.useRef(new Map<string, HTMLLIElement>());
  const listRef = React.useRef<HTMLOListElement>(null);
  const commitTimer = React.useRef<number | null>(null);
  const pendingFocus = React.useRef<string | null>(null);

  const byId = React.useMemo(
    () => new Map(playlist.items.map((item) => [item.id, item])),
    [playlist.items],
  );
  const serverIds = React.useMemo(() => playlist.items.map((i) => i.id), [playlist.items]);
  const ids = React.useMemo(() => {
    if (!draft) return serverIds;
    const known = draft.filter((id) => byId.has(id));
    // Items added by someone else meanwhile go to the end of the draft.
    return [...known, ...serverIds.filter((id) => !known.includes(id))];
  }, [draft, serverIds, byId]);

  const commit = React.useCallback(
    (next: string[]) => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
      const valid = next.filter((id) => byId.has(id));
      if (!orderChanged(valid, serverIds)) {
        setDraft(null);
        return;
      }
      reorder.mutate(valid, {
        onError: (error) => {
          toast.error(errorMessage(error, 'Couldn’t save the new order. Try again.'));
          setAnnouncement('The new order couldn’t be saved and was reverted.');
        },
        onSettled: () => setDraft((current) => (current === next ? null : current)),
      });
    },
    [byId, serverIds, reorder],
  );

  React.useEffect(
    () => () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
    },
    [],
  );

  // Restore focus to the control that moved (the row re-renders in a new place).
  React.useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const selector = pendingFocus.current;
    pendingFocus.current = null;
    listRef.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  const move = (from: number, to: number, focus: 'handle' | 'up' | 'down', immediate = false) => {
    if (to < 0 || to >= ids.length || from === to) return;
    const id = ids[from]!;
    const next = moveItem(ids, from, to);
    setDraft(next);
    const title = byId.get(id)?.movie.title ?? 'Movie';
    setAnnouncement(`${title} moved to position ${to + 1} of ${ids.length}.`);
    // Keep focus on the same control; switch to the other arrow if this one becomes disabled.
    const attr =
      focus === 'handle'
        ? 'data-handle'
        : focus === 'up'
          ? to === 0
            ? 'data-move-down'
            : 'data-move-up'
          : to === ids.length - 1
            ? 'data-move-up'
            : 'data-move-down';
    pendingFocus.current = `[${attr}="${id}"]`;
    if (immediate) commit(next);
    else {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(() => commit(next), KEYBOARD_COMMIT_DELAY_MS);
    }
  };

  const onRemove = (item: PlaylistItem) => {
    // Flush a pending reorder so the server sees a consistent item set.
    if (commitTimer.current && draft) commit(draft);
    remove.mutate(item.id, {
      onSuccess: () => toast.success(`Removed “${item.movie.title}”`),
      onError: (error) => toast.error(errorMessage(error, 'Couldn’t remove it. Try again.')),
    });
  };

  // ---------- pointer drag ----------
  const onHandlePointerDown = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!editable || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const from = ids.indexOf(id);
    const row = rowRefs.current.get(id);
    if (from < 0 || !row) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rects = ids.map((rid) => rowRefs.current.get(rid)?.getBoundingClientRect());
    const gap = rects.length > 1 && rects[0] && rects[1] ? rects[1].top - rects[0].bottom : 8;
    setDrag({
      id,
      pointerId: e.pointerId,
      from,
      over: from,
      startY: e.clientY,
      dy: 0,
      shift: row.getBoundingClientRect().height + Math.max(0, gap),
      centers: rects.map((r) => (r ? r.top + r.height / 2 : 0)),
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.startY;
    const draggedCenter = drag.centers[drag.from]! + dy;
    const others = drag.centers.filter((_, i) => i !== drag.from);
    setDrag({ ...drag, dy, over: dropIndex(draggedCenter, others) });
  };

  const endDrag = (e: React.PointerEvent, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { from, over } = drag;
    setDrag(null);
    if (!cancelled && from !== over) move(from, over, 'handle', true);
  };

  const translateFor = (index: number): number => {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.over && index > drag.from && index <= drag.over) return -drag.shift;
    if (drag.from > drag.over && index >= drag.over && index < drag.from) return drag.shift;
    return 0;
  };

  return (
    <>
      {editable ? (
        <p id="playlist-reorder-help" className="sr-only">
          Use the arrow keys on a reorder handle to move a movie up or down, Home or End to move it
          to the start or end. Changes save automatically.
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <ol
        ref={listRef}
        aria-label={`Movies in ${playlist.name}`}
        className={cn('grid gap-2', drag && 'select-none')}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e)}
        onPointerCancel={(e) => endDrag(e, true)}
        onLostPointerCapture={(e) => endDrag(e)}
      >
        {ids.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <ItemRow
              key={id}
              item={item}
              index={index}
              count={ids.length}
              editable={editable}
              showAddedBy={playlist.collaborative || playlist.collaborators.length > 0}
              dragging={drag?.id === id}
              translate={translateFor(index)}
              onHandlePointerDown={onHandlePointerDown(id)}
              onMove={(to, focus) => move(index, to, focus)}
              onRemove={() => onRemove(item)}
              rowRef={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
            />
          );
        })}
      </ol>
    </>
  );
}
