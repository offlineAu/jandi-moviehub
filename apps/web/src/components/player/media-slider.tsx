'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { clamp, type Range } from './utils';

interface MediaSliderProps {
  label: string;
  value: number;
  max: number;
  valueText: string;
  step: number;
  bigStep: number;
  /** Called continuously while dragging (preview). */
  onScrub?: (value: number) => void;
  /** Called when the user commits a value (pointer up / keyboard). */
  onCommit: (value: number) => void;
  /** Rendered over the track while hovering (e.g. a time preview). */
  formatPreview?: (value: number) => string;
  buffered?: Range[];
  disabled?: boolean;
  className?: string;
  /** Visual size of the hit area. */
  size?: 'seek' | 'volume';
}

export function MediaSlider({
  label,
  value,
  max,
  valueText,
  step,
  bigStep,
  onScrub,
  onCommit,
  formatPreview,
  buffered,
  disabled,
  className,
  size = 'seek',
}: MediaSliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [dragValue, setDragValue] = React.useState<number | null>(null);
  const [hover, setHover] = React.useState<{ x: number; value: number } | null>(null);
  const safeMax = max > 0 && Number.isFinite(max) ? max : 0;
  const shown = dragValue ?? value;
  const pct = safeMax ? clamp((shown / safeMax) * 100, 0, 100) : 0;

  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { value: 0, x: 0 };
    const x = clamp(clientX - rect.left, 0, rect.width);
    return { value: (x / rect.width) * safeMax, x };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !safeMax || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { value: v } = valueAt(e.clientX);
    setDragValue(v);
    onScrub?.(v);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!safeMax) return;
    const { value: v, x } = valueAt(e.clientX);
    if (e.pointerType === 'mouse') setHover({ x, value: v });
    if (dragValue !== null) {
      setDragValue(v);
      onScrub?.(v);
    }
  };
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragValue === null) return;
    const { value: v } = valueAt(e.clientX);
    setDragValue(null);
    onCommit(clamp(v, 0, safeMax));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step;
        break;
      case 'PageDown':
        next = value - bigStep;
        break;
      case 'PageUp':
        next = value + bigStep;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = safeMax;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !safeMax) return;
    onCommit(clamp(next, 0, safeMax));
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax * 100) / 100}
      aria-valuenow={Math.round(clamp(shown, 0, safeMax) * 100) / 100}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={() => setDragValue(null)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      className={cn(
        'group/slider relative flex cursor-pointer touch-none items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        size === 'seek' ? 'h-5' : 'h-8',
        disabled && 'cursor-not-allowed',
        className,
      )}
    >
      <div
        ref={trackRef}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150',
          size === 'seek' ? 'h-1 group-hover/slider:h-1.5 group-focus-visible/slider:h-1.5' : 'h-1',
        )}
      >
        {buffered?.map((r, i) =>
          safeMax ? (
            <div
              key={i}
              aria-hidden="true"
              className="absolute inset-y-0 bg-white/30"
              style={{
                left: `${(r.start / safeMax) * 100}%`,
                width: `${((r.end - r.start) / safeMax) * 100}%`,
              }}
            />
          ) : null,
        )}
        <div
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0', disabled ? 'bg-white/50' : 'bg-brand')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(168_85_247/0.35)] transition-transform duration-150',
          size === 'seek'
            ? 'scale-0 group-hover/slider:scale-100 group-focus-visible/slider:scale-100'
            : 'scale-90',
          dragValue !== null && 'scale-100',
          disabled && 'hidden',
        )}
        style={{ left: `${pct}%` }}
      />
      {formatPreview && hover && !disabled ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 text-xs font-medium tabular-nums text-white ring-1 ring-white/15"
          style={{ left: hover.x }}
        >
          {formatPreview(hover.value)}
        </div>
      ) : null}
    </div>
  );
}
